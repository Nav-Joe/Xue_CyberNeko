import type { ChatHistoryMessage } from '../../../src/services/chat/types'
import { logWarn } from '../logging/logger'
import {
  completeMemoryChat,
  KEYWORDS_RECALL_HINT,
  parseLlmSummaryContent,
  type LlmSummaryPayload
} from './summarizeLlm'

const PERIOD_SYSTEM = `你是记忆周期整理助手。根据若干条已有会话/周摘要，写出更高一层的中文周期总结，只输出 JSON，不要 Markdown。
格式：
{"summary":"一段话","key_facts":["要点"],"emotion_tags":["标签"],"significance":7,"keywords":["检索词"],"memory_kind":"habit"}
要求：
- summary 100～280 字；key_facts 2～8 条短句，尽量含可检索专名/实体
- keywords：3～6 个；${KEYWORDS_RECALL_HINT}
- significance 0～10；memory_kind 三选一 emotion_peak|habit|fact（高峰情感/习惯/日常事实，不确定用 habit）。`

function formatItems(
  items: Array<{
    summary: string
    keyFacts?: string[]
    keywords?: string[]
    startedAt?: Date
    periodStart?: Date
    periodEnd?: Date
  }>
): string {
  return items
    .map((it, i) => {
      const when =
        it.periodStart && it.periodEnd
          ? `${it.periodStart.toISOString().slice(0, 10)}~${it.periodEnd.toISOString().slice(0, 10)}`
          : it.startedAt
            ? it.startedAt.toISOString().slice(0, 10)
            : ''
      const facts = (it.keyFacts ?? []).join('；')
      const kws = (it.keywords ?? []).join(',')
      return `[#${i + 1}${when ? ` ${when}` : ''}]\n摘要:${it.summary}\n要点:${facts}\n关键词:${kws}`
    })
    .join('\n\n')
    .slice(0, 14000)
}

export async function summarizePeriodWithLlm(
  kind: 'weekly' | 'monthly',
  items: Array<{
    summary: string
    keyFacts?: string[]
    keywords?: string[]
    startedAt?: Date
    periodStart?: Date
    periodEnd?: Date
  }>
): Promise<Omit<LlmSummaryPayload, 'engine'>> {
  if (items.length === 0) throw new Error('无材料可总结')
  const label = kind === 'weekly' ? '周' : '月'
  const messages: ChatHistoryMessage[] = [
    { role: 'system', content: PERIOD_SYSTEM },
    {
      role: 'user',
      content: `请将以下材料整理为一条${label}总结 JSON：\n\n${formatItems(items)}`
    }
  ]
  try {
    const content = await completeMemoryChat(messages)
    return parseLlmSummaryContent(content)
  } catch (error) {
    logWarn('memory', `summarizePeriodWithLlm ${kind} failed`, error)
    throw error
  }
}
