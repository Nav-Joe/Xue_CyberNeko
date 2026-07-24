import type { ChatLlmMode } from '../../../src/services/chat/types'

/** 中文粗估：约 1.5 字 ≈ 1 token（core / summary 共用） */
export const CHARS_PER_TOKEN_EST = 1.5

/** OpenAI / 默认档（现网行为，勿改数值以免动 OpenAI 体验） */
export const OPENAI_MEMORY_BUDGET = {
  profile: 'openai_api' as const,
  corePoolMax: 5,
  coreMaxTokens: 300,
  coreMaxChars: 450,
  summaryMaxTokens: 1024
}

/** 本地 llama 收紧档 */
export const LOCAL_LLAMA_MEMORY_BUDGET = {
  profile: 'local_llama' as const,
  corePoolMax: 2,
  coreMaxTokens: 100,
  coreMaxChars: Math.floor(100 * CHARS_PER_TOKEN_EST),
  summaryMaxTokens: 254
}

export type MemoryBudget = typeof OPENAI_MEMORY_BUDGET | typeof LOCAL_LLAMA_MEMORY_BUDGET

/** 按聊天 LLM 模式取记忆预算；非 local 一律走 OpenAI 默认档 */
export function memoryBudgetForMode(mode: ChatLlmMode | undefined | null): MemoryBudget {
  if (mode === 'local_llama') return LOCAL_LLAMA_MEMORY_BUDGET
  return OPENAI_MEMORY_BUDGET
}
