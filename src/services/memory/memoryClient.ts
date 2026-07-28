import type { ChatHistoryMessage } from '../chat/types'
import { scheduleMemoryBackground } from './scheduleMemoryBackground'
import type { MemoryTimelineItem } from './types'

/**
 * 渲染侧记忆 IPC 客户端（OPT-10 分档）：
 *
 * | 档 | 含义 | 本文件示例 |
 * |----|------|------------|
 * | ① Prompt 必等 | 发消息前 await，结果进本轮 prompt；允许拖首 token，但禁止塞总结 LLM | history / promptBlock / peeks |
 * | ② 开局 F&F | `scheduleMemoryBackground`，不阻塞首 token | period rollup；user raw append |
 * | ③ 轮后 F&F | 本轮 LLM+TTS 结束后；assistant raw **await 落库**后，mid consolidate **不 await** | assistant raw + mid consolidate |
 */

export async function getMemoryStatus(): Promise<{
  ready: boolean
  memoryEnabled: boolean
  memoryConsolidateOnChatClose: boolean
}> {
  if (!window.electronAPI?.memoryGetStatus) {
    return { ready: false, memoryEnabled: false, memoryConsolidateOnChatClose: true }
  }
  return window.electronAPI.memoryGetStatus()
}

export async function appendMemoryRawLog(payload: {
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}): Promise<boolean> {
  const result = await window.electronAPI?.memoryAppendRawLog?.(payload)
  return result?.ok === true
}

/** ② 开局 F&F：写 user raw，失败静默。 */
export function appendMemoryRawLogInBackground(payload: {
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}): void {
  scheduleMemoryBackground('append-raw-log', () => appendMemoryRawLog(payload))
}

export async function listMemoryTimeline(payload?: {
  layer?: string
  limit?: number
}): Promise<MemoryTimelineItem[]> {
  const result = await window.electronAPI?.memoryListTimeline?.(payload)
  if (!result || !result.ok) return []
  return result.items
}

/** ① Prompt 必等：成功返回消息列表（可空）；失败 / 不可用返回 null。 */
export async function getRecentMemoryHistory(
  maxRounds: number
): Promise<ChatHistoryMessage[] | null> {
  try {
    const result = await window.electronAPI?.memoryGetRecentHistory?.({ maxRounds })
    if (!result || !result.ok) return null
    return result.messages
  } catch {
    return null
  }
}

/** ① Prompt 必等：L1/L3 注入块；失败返回空串（不阻断聊天）。 */
export async function getMemoryPromptBlock(userInput: string): Promise<string> {
  try {
    const result = await window.electronAPI?.memoryGetPromptContext?.({ userInput })
    if (!result || !result.ok) return ''
    return result.block?.trim() ?? ''
  } catch {
    return ''
  }
}

/**
 * ① Prompt 必等：消费待发送的偷看标记（UI 不展示）。
 * 无 pending / 失败 → 空串。
 */
export async function consumePendingPeeksForUserTurn(): Promise<string> {
  try {
    const result = await window.electronAPI?.memoryConsumePendingPeeks?.()
    if (!result || !result.ok) return ''
    return result.prefix?.trim() ?? ''
  } catch {
    return ''
  }
}

/** ② 开局 F&F：周/月滚总结，不阻塞首 token。 */
export function maybeRunPeriodRollup(): void {
  scheduleMemoryBackground('period-rollup', () =>
    window.electronAPI?.memoryMaybePeriodRollup?.()
  )
}

/**
 * ③ 轮后：满轮日常总结并裁窗口（可 await，供测试 / 主进程外调用）。
 * 聊天热路径请用 `maybeMidSessionConsolidateInBackground`（OPT-10 B）。
 * 失败静默。
 */
export async function maybeMidSessionConsolidate(sessionId: string): Promise<void> {
  try {
    await window.electronAPI?.memoryMaybeMidSessionConsolidate?.({ sessionId })
  } catch {
    /* ignore */
  }
}

/** ③ 轮后 F&F：不拖 `sending`/`replyPending`；与关窗总结仍靠主进程 consolidateChain 串行。 */
export function maybeMidSessionConsolidateInBackground(sessionId: string): void {
  scheduleMemoryBackground('mid-session-consolidate', () =>
    maybeMidSessionConsolidate(sessionId)
  )
}

export async function recordMemoryPeek(): Promise<void> {
  await window.electronAPI?.memoryRecordPeek?.()
}

export async function notifyMemoryChatClosed(sessionId?: string): Promise<void> {
  await window.electronAPI?.memoryNotifyChatClosed?.(sessionId ? { sessionId } : undefined)
}
