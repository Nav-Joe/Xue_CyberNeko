/**
 * 游戏会话内一轮：确认还在玩 → 截屏观察 → 生成旁白 → 等 TTS 播完，再开始下一轮间隔计时。
 */
import { logInfo, logWarn } from '../logging/logger'
import { readScreenCompanionConfig } from './configStore'
import { generateCompanionNarrate } from './narrate'
import {
  emitCompanionNarrate,
  resetCompanionNarrateDelivery,
  waitForCompanionNarrateTtsDone
} from './narrateDelivery'
import { observePrimaryScreen } from './observe'
import { setLatestObservation } from './snapshot'
import { clampIntervalSec } from './intervalSec'
import { appendCompanionMemoryLog } from './companionMemoryLog'
import type { SchedulerDeps } from './schedulerDeps'
import type { SessionState } from './schedulerState'

export type CycleContext = {
  deps: SchedulerDeps
  session: SessionState
  pathUnderGameRoot: (exePath: string, gameRoot: string) => boolean
  leaveSession: (reason: string) => void
  getNextCycleAtMs: () => number | null
  setNextCycleAtMs: (ms: number | null) => void
  getCycleBusy: () => boolean
  setCycleBusy: (v: boolean) => void
  setLastNarratedAtMs: (ms: number | null) => void
  setLastObservedAtMs: (ms: number | null) => void
}

async function isSessionStillPlaying(ctx: CycleContext): Promise<boolean> {
  const paths = await ctx.deps.listProcessExecutablePaths()
  return paths.some((p) => ctx.pathUnderGameRoot(p, ctx.session.gameRoot))
}

function scheduleNextCycle(ctx: CycleContext, anchorMs: number): void {
  const intervalMs = clampIntervalSec(readScreenCompanionConfig().intervalSec) * 1000
  ctx.setNextCycleAtMs(anchorMs + intervalMs)
}

/** 旁白已发出且 TTS 全部播完后，才从这个时间点开始算下一轮间隔 */
function scheduleNextCycleAfterNarrateReleased(ctx: CycleContext, anchorMs: number): void {
  scheduleNextCycle(ctx, anchorMs)
}

export async function runSessionCycleTick(ctx: CycleContext): Promise<void> {
  if (ctx.getCycleBusy()) return
  const now = ctx.deps.nowMs()
  const nextAt = ctx.getNextCycleAtMs()
  if (nextAt != null && now < nextAt) return

  ctx.setCycleBusy(true)
  try {
    const config = readScreenCompanionConfig()
    if (!config.enabled) return

    try {
      const still = await isSessionStillPlaying(ctx)
      if (!still) {
        ctx.leaveSession('interval-not-playing')
        return
      }
    } catch (error) {
      logWarn('screenCompanion', 'cycle play-check failed; defer', error)
      scheduleNextCycle(ctx, now)
      return
    }

    const observeStarted = ctx.deps.nowMs()
    let observation = null as import('./types').ScreenObservation | null
    try {
      const result = await ctx.deps.observePrimaryScreen({
        enabled: true,
        pausedUntilMs: config.pausedUntilMs,
        processBlacklist: config.processBlacklist,
        vision: config.vision
      })
      observation = result.observation
      setLatestObservation(observation)
      ctx.setLastObservedAtMs(ctx.deps.nowMs())
      const observeSummary = observation?.summary?.trim()
      if (observeSummary) {
        appendCompanionMemoryLog(ctx.session.companionSessionId, {
          kind: 'observe',
          gameName: ctx.session.gameName,
          text: observeSummary
        })
      }
    } catch (error) {
      logWarn('screenCompanion', 'cycle observe failed', error)
      scheduleNextCycle(ctx, ctx.deps.nowMs())
      return
    }

    if (!observation?.usableForPrompt) {
      scheduleNextCycle(ctx, ctx.deps.nowMs())
      return
    }

    const generate = ctx.deps.generateNarrate ?? generateCompanionNarrate
    const line = await generate({
      gameName: ctx.session.gameName,
      observation
    })
    if (!line) {
      scheduleNextCycle(ctx, ctx.deps.nowMs())
      return
    }

    appendCompanionMemoryLog(ctx.session.companionSessionId, {
      kind: 'narrate',
      gameName: ctx.session.gameName,
      text: line
    })

    const ts = ctx.deps.nowMs()
    let deliverResult: import('./narrateDelivery').CompanionNarrateDeliverResult = 'playback_failed'
    if (ctx.deps.deliverNarrateTts) {
      deliverResult = await ctx.deps.deliverNarrateTts({
        text: line,
        gameName: ctx.session.gameName,
        ts
      })
    } else {
      const sent = emitCompanionNarrate({ text: line, gameName: ctx.session.gameName, ts })
      if (!sent) {
        scheduleNextCycle(ctx, ctx.deps.nowMs())
        return
      }
      logInfo('screenCompanion', `narrate tts dispatched game=${ctx.session.gameName}`)
      const playbackOk = await waitForCompanionNarrateTtsDone(ts)
      deliverResult = playbackOk ? 'playback_done' : 'playback_failed'
    }
    const anchor = ctx.deps.nowMs()
    if (deliverResult === 'playback_done') {
      ctx.setLastNarratedAtMs(anchor)
      logInfo(
        'screenCompanion',
        `narrate tts fully released; intervalSec starts after ${anchor}`
      )
      scheduleNextCycleAfterNarrateReleased(ctx, anchor)
    } else if (deliverResult === 'emit_failed') {
      logWarn('screenCompanion', 'narrate emit failed; next interval without tts')
      scheduleNextCycle(ctx, anchor)
    } else {
      logWarn('screenCompanion', 'narrate playback failed; next interval without successful tts')
      scheduleNextCycle(ctx, anchor)
    }
    void observeStarted
  } finally {
    ctx.setCycleBusy(false)
  }
}

export function onSchedulerStopCycle(): void {
  resetCompanionNarrateDelivery()
}
