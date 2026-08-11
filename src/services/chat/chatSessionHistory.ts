import type { ChatHistoryMessage, ChatUiMessage } from './types'

/** UI 气泡 → 发给模型的历史（连续 assistant 气泡合并） */
export function toHistoryMessages(messages: ChatUiMessage[]): ChatHistoryMessage[] {
  const history: ChatHistoryMessage[] = []

  for (const item of messages) {
    if (item.role !== 'user' && item.role !== 'assistant') continue
    const content = item.content.trim()
    if (!content) continue

    const prev = history[history.length - 1]
    if (item.role === 'assistant' && prev?.role === 'assistant') {
      prev.content += item.content
    } else {
      history.push({ role: item.role, content: item.content })
    }
  }

  return history
}
