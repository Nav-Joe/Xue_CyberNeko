import type { ChatHistoryMessage, ChatLlmMode } from './types'

/** 本地 llama-server 默认 -c 4096；预留 system + 当前轮 + 生成，约 10 轮中文对话 */
export const LOCAL_LLAMA_MAX_HISTORY_ROUNDS = 10

/** 第三方 OpenAI 兼容 API：M3 固定保留最近 30 轮 */
export const OPENAI_API_MAX_HISTORY_ROUNDS = 30

/**
 * 日常总结软上限（满则本轮 LLM+TTS 结束后触发会话总结并裁 raw）。
 * OpenAI：积累到 50 → 裁到 30；本地：积累到 20 → 裁到 10。
 */
export const LOCAL_LLAMA_SOFT_MAX_HISTORY_ROUNDS = 20
export const OPENAI_API_SOFT_MAX_HISTORY_ROUNDS = 50

export function maxHistoryRoundsForMode(mode: ChatLlmMode): number {
  return mode === 'local_llama' ? LOCAL_LLAMA_MAX_HISTORY_ROUNDS : OPENAI_API_MAX_HISTORY_ROUNDS
}

/** 日常总结触发阈值（≥ 则 mid-session consolidate） */
export function softMaxHistoryRoundsForMode(mode: ChatLlmMode): number {
  return mode === 'local_llama'
    ? LOCAL_LLAMA_SOFT_MAX_HISTORY_ROUNDS
    : OPENAI_API_SOFT_MAX_HISTORY_ROUNDS
}

/** 日常总结成功后保留的 raw 轮数（= 开窗/prompt 默认窗口） */
export function softKeepHistoryRoundsForMode(mode: ChatLlmMode): number {
  return maxHistoryRoundsForMode(mode)
}

/** 聊天 UI 提示：当前模式下 LLM 可见的最大对话轮数 */
export function formatHistoryWindowHint(mode: ChatLlmMode): string {
  const rounds = maxHistoryRoundsForMode(mode)
  return `模型上下文最多保留最近 ${rounds} 轮对话（更早消息仍可在界面查看，但不会发给模型）`
}

/** 1 轮 = user + 其后连续 assistant（TTS 多气泡已在上游合并） */
export function splitHistoryIntoRounds(history: ChatHistoryMessage[]): ChatHistoryMessage[][] {
  const rounds: ChatHistoryMessage[][] = []
  let current: ChatHistoryMessage[] = []

  for (const msg of history) {
    if (msg.role === 'user') {
      if (current.length > 0) {
        rounds.push(current)
      }
      current = [msg]
      continue
    }
    if (msg.role === 'assistant' && current.length > 0) {
      current.push(msg)
    }
  }

  if (current.length > 0) {
    rounds.push(current)
  }

  return rounds
}

/** 仅保留最近 maxRounds 轮（时间线上最新），丢弃更早的轮次；UI 仍展示完整会话 */
export function trimHistoryToRounds(
  history: ChatHistoryMessage[],
  maxRounds: number
): ChatHistoryMessage[] {
  if (maxRounds <= 0 || history.length === 0) return []
  const rounds = splitHistoryIntoRounds(history)
  // slice(-N) = 数组末尾 N 轮 = 对话里最新发生的 N 轮
  return rounds.slice(-maxRounds).flat()
}
