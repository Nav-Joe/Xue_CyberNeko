/**
 * 把旁白发给桌宠窗做 TTS，并等到播完（主进程据此再开下一轮间隔）。
 */
import { logWarn } from '../logging/logger'
import {
  describePetNarrateResolveFailure,
  resolvePetNarrateWebContents
} from '../windows/petNarrateTarget'

export type CompanionNarratePayload = {
  text: string
  gameName: string
  ts: number
}

let pending:
  | {
      ts: number
      resolve: (ok: boolean) => void
      timer: ReturnType<typeof setTimeout>
      extendCount: number
    }
  | null = null

/** 旁白 TTS 粗估等待：合成+按序播放；慢引擎下单段可 >2min */
const MIN_TTS_WAIT_MS = 300_000
const MAX_TTS_WAIT_MS = 600_000
const TTS_WAIT_BASE_MS = 120_000
const TTS_WAIT_MS_PER_CHAR = 2000
const TTS_WAIT_EXTEND_MS = 120_000

export type CompanionNarrateDeliverResult = 'playback_done' | 'emit_failed' | 'playback_failed'

/** 供单测与调度：按旁白长度估算主进程等待上限 */
export function estimateCompanionTtsWaitMs(text: string): number {
  const len = text.trim().length
  return Math.min(MAX_TTS_WAIT_MS, Math.max(MIN_TTS_WAIT_MS, TTS_WAIT_BASE_MS + len * TTS_WAIT_MS_PER_CHAR))
}

export function emitCompanionNarrate(payload: CompanionNarratePayload): boolean {
  const wc = resolvePetNarrateWebContents()
  if (!wc) {
    const diag = describePetNarrateResolveFailure()
    logWarn(
      'screenCompanion',
      'narrate emit failed (no pet renderer)',
      undefined,
      `registeredId=${diag.registeredId ?? 'null'} windows=${JSON.stringify(diag.windows)}`
    )
    return false
  }
  try {
    wc.send('screen-companion-narrate', payload)
    return true
  } catch (error) {
    logWarn('screenCompanion', 'narrate emit send failed', error)
    return false
  }
}

/** 生产默认：投递旁白并阻塞至桌宠 TTS 全部释放（按序 synth+播放完） */
export async function deliverCompanionNarrateTts(
  input: CompanionNarratePayload
): Promise<CompanionNarrateDeliverResult> {
  if (!emitCompanionNarrate(input)) return 'emit_failed'
  const ok = await waitForCompanionNarrateTtsDone(input.ts, estimateCompanionTtsWaitMs(input.text))
  return ok ? 'playback_done' : 'playback_failed'
}

function schedulePendingTimeout(ts: number, timeoutMs: number): void {
  if (!pending || pending.ts !== ts) return
  clearTimeout(pending.timer)
  pending.timer = setTimeout(() => {
    if (!pending || pending.ts !== ts) return
    pending.extendCount += 1
    logWarn(
      'screenCompanion',
      `narrate tts still waiting for full release; extend #${pending.extendCount} (+${TTS_WAIT_EXTEND_MS}ms)`
    )
    schedulePendingTimeout(ts, TTS_WAIT_EXTEND_MS)
  }, timeoutMs)
}

/** 阻塞至桌宠 notify 确认 TTS 释放；不因超时而提前返回（仅被新 wait / reset 打断） */
export function waitForCompanionNarrateTtsDone(
  ts: number,
  timeoutMs = MIN_TTS_WAIT_MS
): Promise<boolean> {
  if (pending) {
    pending.resolve(false)
    clearTimeout(pending.timer)
    pending = null
  }
  return new Promise((resolve) => {
    pending = { ts, resolve, timer: setTimeout(() => {}, 0), extendCount: 0 }
    schedulePendingTimeout(ts, timeoutMs)
  })
}

export function notifyCompanionNarrateTtsDone(input: { ts: number; ok: boolean }): void {
  if (!pending || pending.ts !== input.ts) return
  clearTimeout(pending.timer)
  pending.resolve(input.ok)
  pending = null
}

export function resetCompanionNarrateDelivery(): void {
  if (pending) {
    clearTimeout(pending.timer)
    pending.resolve(false)
    pending = null
  }
}
