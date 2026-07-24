import { readChatConfigFile } from '../chat/chat-config'

export type MemoryFlags = {
  memoryEnabled: boolean
  memoryConsolidateOnChatClose: boolean
  /** 关窗整理时用聊天 LLM 总结；关闭则不总结 */
  memoryLlmSummarizeEnabled: boolean
  /** M4.2：总结后情感打分 + 关键词；关闭则跳过打分/核心池 */
  memoryEmotionScoreEnabled: boolean
}

const DEFAULT_FLAGS: MemoryFlags = {
  memoryEnabled: false,
  memoryConsolidateOnChatClose: true,
  memoryLlmSummarizeEnabled: true,
  memoryEmotionScoreEnabled: true
}

export function readMemoryFlags(): MemoryFlags {
  try {
    const config = readChatConfigFile()
    return {
      memoryEnabled: config.memoryEnabled === true,
      memoryConsolidateOnChatClose: config.memoryConsolidateOnChatClose !== false,
      memoryLlmSummarizeEnabled: config.memoryLlmSummarizeEnabled !== false,
      memoryEmotionScoreEnabled: config.memoryEmotionScoreEnabled !== false
    }
  } catch {
    // vitest / 无 Electron app → 产品默认（总结与打分开）
    return { ...DEFAULT_FLAGS }
  }
}
