/**
 * 把陪玩临时记录交给 LLM，整理成一条会话摘要（字段形状与聊天总结一致）。
 */
import type { ChatHistoryMessage } from '../../../src/services/chat/types'
import { logWarn } from '../logging/logger'
import { KEYWORDS_RECALL_HINT, type LlmSummaryPayload } from './summarizeLlm'
import { completeMemoryChat, parseLlmSummaryContent } from './summarizeLlm'
import type { CompanionMemoryLogEntry } from '../screenCompanion/companionMemoryLog'

const COMPANION_SYSTEM_PROMPT = `你是记忆整理助手。以下是猫娘在用户玩 Steam 游戏时的陪玩记录（旁白与屏幕摘要，非用户聊天对话）。
请写出简洁中文摘要并评估重要性，只输出 JSON，不要 Markdown。
格式严格为：
{"summary":"一段话概括本次陪玩","key_facts":["要点1","要点2"],"emotion_tags":["可选标签"],"significance":6,"keywords":["关键词1","关键词2"],"memory_kind":"habit"}
要求：
- summary 80～200 字；突出游戏名、玩法片段、情绪与陪伴高光
- key_facts 1～5 条，尽量含游戏名/关卡/行为等可检索专名
- significance：0～10；9.5+ 仅用于极重要陪伴事实
- keywords：3～5 个；${KEYWORDS_RECALL_HINT}
- memory_kind：emotion_peak | habit | fact`

function formatLogTimestamp(ts: number): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function buildCompanionMemoryTranscript(
  gameName: string,
  entries: CompanionMemoryLogEntry[]
): string {
  return entries
    .map((entry) => {
      const when = formatLogTimestamp(entry.ts)
      const label = entry.kind === 'narrate' ? '旁白' : '屏幕摘要'
      const prefix = when ? `[${when}] ` : ''
      return `${prefix}${label}（${gameName || entry.gameName}）: ${entry.text}`
    })
    .join('\n')
    .slice(0, 12000)
}

export async function summarizeCompanionLogsWithLlm(input: {
  gameName: string
  entries: CompanionMemoryLogEntry[]
}): Promise<LlmSummaryPayload> {
  const transcript = buildCompanionMemoryTranscript(input.gameName, input.entries)
  if (!transcript.trim()) {
    throw new Error('无陪玩记录可总结')
  }
  const messages: ChatHistoryMessage[] = [
    { role: 'system', content: COMPANION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `游戏：${input.gameName}\n\n陪玩记录：\n${transcript}\n\n请输出 JSON。`
    }
  ]
  try {
    const content = await completeMemoryChat(messages)
    const parsed = parseLlmSummaryContent(content)
    return { ...parsed, engine: 'llm' }
  } catch (error) {
    logWarn('memory', 'summarizeCompanionLogsWithLlm failed', error)
    throw error
  }
}
