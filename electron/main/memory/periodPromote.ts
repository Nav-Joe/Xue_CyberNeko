import { logInfo } from '../logging/logger'
import { readChatConfigFile, toChatConfigView } from '../chat/chat-config'
import { tryPromoteToCorePool } from './corePool'
import type { MemoryDatabase } from './dbCore'
import { readMemoryFlags } from './flags'
import { memoryBudgetForMode, OPENAI_MEMORY_BUDGET } from './memoryBudgets'

/** 周/月成功写入后：significance≥9.5 且 emotion 开关开 → 尝试核心池（与会话总结同规则）。 */
export function maybePromotePeriodToCore(
  db: MemoryDatabase,
  input: {
    periodId: string
    kind: 'weekly' | 'monthly'
    summary: string
    significance: number
    keywords: string[]
    memoryKind?: string
  }
): boolean {
  let emotionEnabled = true
  try {
    emotionEnabled = readMemoryFlags().memoryEmotionScoreEnabled
  } catch {
    /* 无 Electron 配置时默认开启（与产品默认一致） */
  }
  if (!emotionEnabled) return false

  let budget = OPENAI_MEMORY_BUDGET
  try {
    budget = memoryBudgetForMode(toChatConfigView(readChatConfigFile()).llmMode)
  } catch {
    /* vitest / 配置不可用 → OpenAI 档 */
  }

  const promo = tryPromoteToCorePool(db, {
    content: input.summary,
    significance: input.significance,
    keywords: input.keywords,
    memoryKind: input.memoryKind,
    sourceSession: input.periodId,
    category: input.kind === 'weekly' ? '周总结' : '月总结',
    budget
  })
  logInfo(
    'memory',
    `${input.kind} core promote`,
    `id=${input.periodId} significance=${input.significance} promoted=${promo.promoted} reason=${promo.reason}`
  )
  return promo.promoted
}
