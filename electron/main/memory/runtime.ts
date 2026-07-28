import { logInfo, logWarn } from '../logging/logger'
import { consolidateOnChatClose } from './consolidate'
import { openMemoryDb, closeMemoryDb, getMemoryDb, type MemoryDatabase } from './db'
import { readMemoryFlags } from './flags'
import { purgeLegacyPeekMeta } from './peek'

let ready = false
let preferredSessionId: string | undefined
let finalizeInflight: Promise<void> | null = null

/** 应用启动：打开 memory.db 并 migrate()。失败只记日志，不阻断桌宠启动。 */
export function initMemorySubsystem(): void {
  try {
    openMemoryDb()
    ready = true
    const flags = readMemoryFlags()
    logInfo(
      'memory',
      'Memory DB ready',
      `enabled=${flags.memoryEnabled} llmSummarize=${flags.memoryLlmSummarizeEnabled} emotionScore=${flags.memoryEmotionScoreEnabled}`
    )
    try {
      purgeLegacyPeekMeta(getMemoryDb())
    } catch (error) {
      logWarn('memory', 'purge legacy peek meta on init failed', error)
    }
  } catch (error) {
    ready = false
    logWarn('memory', 'Memory DB init failed', error)
  }
}

export function isMemoryReady(): boolean {
  return ready
}

export function requireMemoryDb(): MemoryDatabase {
  if (!ready) {
    throw new Error('Memory DB not ready')
  }
  return getMemoryDb()
}

/** 渲染进程关窗前可先记下 sessionId，供随后「关窗延迟整理」使用。 */
export function notePreferredConsolidateSession(sessionId?: string): void {
  if (sessionId?.trim()) {
    preferredSessionId = sessionId.trim()
  }
}

/**
 * 关窗延迟整理：先做记忆总结（可调 LLM），再 stopLlama。
 * 同一次关窗 / 退出可共用同一 Promise，避免重复总结或过早 kill。
 */
export function runConsolidateThenStopLlama(stopLlama: () => Promise<{ ok: boolean }>): Promise<void> {
  if (finalizeInflight) {
    return finalizeInflight
  }

  finalizeInflight = (async () => {
    const sessionId = preferredSessionId
    preferredSessionId = undefined
    try {
      const flags = readMemoryFlags()
      if (ready && flags.memoryEnabled && flags.memoryConsolidateOnChatClose) {
        await consolidateOnChatClose(requireMemoryDb(), sessionId)
      }
    } catch (error) {
      logWarn('memory', 'runConsolidateThenStopLlama consolidate error', error)
    } finally {
      try {
        await stopLlama()
      } catch (error) {
        logWarn('memory', 'runConsolidateThenStopLlama stopLlama error', error)
      }
      finalizeInflight = null
    }
  })()

  return finalizeInflight
}

/** begin 前等待关窗延迟整理（避免与总结抢 LLM / 端口）；超时仍继续以免卡死开聊。 */
export async function awaitChatCloseFinalize(timeoutMs = 120_000): Promise<void> {
  if (!finalizeInflight) return
  logInfo('memory', 'awaitChatCloseFinalize: waiting for L-delay consolidate/stop')
  await Promise.race([
    finalizeInflight,
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs)
    })
  ])
}

/** 等待进行中的整理（带超时）。 */
async function awaitMemoryFinalizeForQuit(timeoutMs = 60_000): Promise<void> {
  if (!finalizeInflight) {
    return
  }
  await Promise.race([
    finalizeInflight,
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs)
    })
  ])
}

/** 应用退出：若关窗整理仍在飞则等待；聊天仍开或已记下 session 则补跑整理；否则只停 llama。 */
export async function finalizeForAppQuit(stopLlama: () => Promise<{ ok: boolean }>): Promise<void> {
  if (finalizeInflight) {
    await awaitMemoryFinalizeForQuit(60_000)
    return
  }

  let chatStillOpen = false
  try {
    const { getChatWindow } = await import('../chat/window')
    chatStillOpen = Boolean(getChatWindow())
  } catch {
    chatStillOpen = false
  }

  if (chatStillOpen || preferredSessionId) {
    await runConsolidateThenStopLlama(stopLlama)
    return
  }

  try {
    await stopLlama()
  } catch (error) {
    logWarn('memory', 'finalizeForAppQuit stopLlama error', error)
  }
}

/** @deprecated 关窗整理已并入关窗延迟整理；保留空操作以免旧 IPC 炸 */
export function scheduleConsolidateOnChatClose(sessionId?: string): void {
  notePreferredConsolidateSession(sessionId)
}

export function shutdownMemorySubsystem(): void {
  try {
    closeMemoryDb()
  } catch {
    /* ignore */
  }
  ready = false
}
