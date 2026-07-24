import type { ChatHistoryMessage } from '../chat/types'
import type { MemoryTimelineItem } from './types'

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

export async function listMemoryTimeline(payload?: {
  layer?: string
  limit?: number
}): Promise<MemoryTimelineItem[]> {
  const result = await window.electronAPI?.memoryListTimeline?.(payload)
  if (!result || !result.ok) return []
  return result.items
}

/** 成功返回消息列表（可空）；失败 / 不可用返回 null，由调用方回退内存 historyWindow。 */
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

/** L1/L3 注入块；失败返回空串（不阻断聊天）。 */
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
 * 消费待发送的偷看标记：返回应拼到 LLM user 内容前的前缀（UI 不展示）。
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

/** 对话开局 fire-and-forget：周/月滚总结。 */
export function maybeRunPeriodRollup(): void {
  void window.electronAPI?.memoryMaybePeriodRollup?.().catch(() => {
    /* ignore */
  })
}

/**
 * 本轮 LLM+TTS 结束后：若全局 raw 轮数达软上限则日常总结并裁窗口。
 * 失败静默（不挡下一轮）。
 */
export async function maybeMidSessionConsolidate(sessionId: string): Promise<void> {
  try {
    await window.electronAPI?.memoryMaybeMidSessionConsolidate?.({ sessionId })
  } catch {
    /* ignore */
  }
}

export async function recordMemoryPeek(): Promise<void> {
  await window.electronAPI?.memoryRecordPeek?.()
}

export async function notifyMemoryChatClosed(sessionId?: string): Promise<void> {
  await window.electronAPI?.memoryNotifyChatClosed?.(sessionId ? { sessionId } : undefined)
}
