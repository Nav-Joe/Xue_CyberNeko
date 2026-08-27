import { getChatConfigSecrets, readChatConfigFile, toChatConfigView } from '../chat/chat-config'
import { proxyOpenAiCompletion } from '../chat/openai-proxy'
import { logInfo, logWarn } from '../logging/logger'
import {
  LLM_CHAT_MAX_RETRIES,
  withLlmChatRetry
} from '../../../src/services/chat/llmChatRetry'
import { parseOpenAiCompletionBody } from '../../../src/services/chat/llmOutputParser'
import type { ChatHistoryMessage } from '../../../src/services/chat/types'

import { parseMemoryKind, type MemoryKind } from './vitality'

const SUMMARIZE_TIMEOUT_MS = 45_000

export type LlmSummaryPayload = {
  summary: string
  keyFacts: string[]
  emotionTags: string[]
  significance: number
  keywords: string[]
  memoryKind: MemoryKind
  engine: 'llm'
}

/** 类 RAG 源头：keywords 要短、可被子串命中、含专名（会话/周月 prompt 共用） */
export const KEYWORDS_RECALL_HINT =
  '短标签约 2～6 字，不要整句；优先专名与具体实体（人名、地名、食物、约定活动、作品名）；避免「聊天」「开心」「日常」等空泛词'

const SYSTEM_PROMPT = `你是记忆整理助手。根据对话日志写出简洁中文摘要并评估重要性，只输出 JSON，不要 Markdown，不要其它说明。
格式严格为：
{"summary":"一段话概括本会话","key_facts":["要点1","要点2"],"emotion_tags":["可选标签"],"significance":8,"keywords":["关键词1","关键词2","关键词3"],"memory_kind":"habit"}
要求：
- summary 80～200 字；key_facts 1～5 条短句，尽量写入可检索专名/实体；emotion_tags 可空数组
- significance：0～10（可一位小数）。9.5+ 表示必须长期记住的核心关系事实（深爱、重要承诺、用户真名身份）；日常闲聊 2～5；一般偏好 5～7.5
- keywords：3～5 个；${KEYWORDS_RECALL_HINT}
- memory_kind：三选一。emotion_peak=表白/吵架/离别等高峰情感；habit=睡前晚安等重复习惯；fact=加班/吃面等日常事实。不确定用 habit`

function formatLogTimestamp(ts: Date | number | string | undefined): string {
  if (ts == null) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 拼给总结 LLM 的对话稿（含本地时间戳，便于判断会话时段） */
export function buildTranscript(
  logs: Array<{ role: string; content: string; timestamp?: Date | number | string }>
): string {
  return logs
    .map((l) => {
      const role = l.role === 'assistant' ? '助手' : l.role === 'user' ? '用户' : l.role
      const content = l.content.trim()
      if (!content) return ''
      const when = formatLogTimestamp(l.timestamp)
      return when ? `[${when}] ${role}: ${content}` : `${role}: ${content}`
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 12000)
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('LLM 未返回 JSON')
  }
}

function clampSignificance(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(10, Math.max(0, Math.round(value * 10) / 10))
}

export function parseLlmSummaryContent(content: string): Omit<LlmSummaryPayload, 'engine'> {
  const raw = extractJsonObject(content) as {
    summary?: unknown
    key_facts?: unknown
    keyFacts?: unknown
    emotion_tags?: unknown
    emotionTags?: unknown
    significance?: unknown
    score?: unknown
    keywords?: unknown
    memory_kind?: unknown
    memoryKind?: unknown
  }
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : ''
  if (!summary) throw new Error('summary 为空')
  const factsRaw = Array.isArray(raw.key_facts)
    ? raw.key_facts
    : Array.isArray(raw.keyFacts)
      ? raw.keyFacts
      : []
  const tagsRaw = Array.isArray(raw.emotion_tags)
    ? raw.emotion_tags
    : Array.isArray(raw.emotionTags)
      ? raw.emotionTags
      : []
  const keyFacts = factsRaw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 200))
    .slice(0, 8)
  const emotionTags = tagsRaw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 40))
    .slice(0, 8)
  const num =
    typeof raw.significance === 'number'
      ? raw.significance
      : typeof raw.score === 'number'
        ? raw.score
        : Number(raw.significance ?? raw.score)
  const significance = clampSignificance(num)
  const keywordsRaw = Array.isArray(raw.keywords) ? raw.keywords : []
  const keywords = keywordsRaw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 24))
    .slice(0, 5)
  const memoryKind = parseMemoryKind(raw.memory_kind ?? raw.memoryKind)
  return {
    summary: summary.slice(0, 800),
    keyFacts,
    emotionTags,
    significance,
    keywords,
    memoryKind
  }
}

function mapFetchError(err: unknown, local: boolean): Error {
  if (err instanceof Error && err.name === 'AbortError') {
    return new Error('LLM 请求超时')
  }
  const message = err instanceof Error ? err.message : String(err)
  if (/fetch failed|Failed to fetch|ECONNREFUSED/i.test(message)) {
    return new Error(local ? '无法连接 llama-server，请先扫描并选择本地模型' : '无法连接 OpenAI API')
  }
  return err instanceof Error ? err : new Error(message)
}

/** 单次 HTTP 调用（不含重试）；错误文案与聊天侧对齐，便于 classifyLlmChatError。 */
async function completeChatOnce(messages: ChatHistoryMessage[]): Promise<string> {
  const file = readChatConfigFile()
  const view = toChatConfigView(file)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUMMARIZE_TIMEOUT_MS)

  try {
    if (view.llmMode === 'openai_api') {
      try {
        const secrets = getChatConfigSecrets()
        const result = await proxyOpenAiCompletion({
          baseUrl: view.openai.baseUrl,
          apiKey: secrets.apiKey,
          messages,
          model: view.openai.model.trim(),
          stream: false,
          temperature: Math.min(view.openai.temperature, 0.4),
          outputFormat: view.openai.outputFormat
        })
        if (!result.ok) {
          const status = result.status != null ? `OpenAI API ${result.status}: ` : ''
          throw new Error(`${status}${result.detail || 'OpenAI 总结失败'}`)
        }
        return result.content
      } catch (err) {
        throw mapFetchError(err, false)
      }
    }

    const baseUrl = view.local.selectedBaseUrl.trim()
    const model = view.local.selectedModelId.trim()
    if (!baseUrl || !model) throw new Error('请先在本地模型列表中选择模型')

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          temperature: Math.min(view.local.temperature, 0.4)
        }),
        signal: controller.signal
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(
          `llama-server ${response.status}: ${detail.slice(0, 200) || response.statusText}`
        )
      }
      const json = (await response.json()) as unknown
      return parseOpenAiCompletionBody(json)
    } catch (err) {
      throw mapFetchError(err, true)
    }
  } finally {
    clearTimeout(timer)
  }
}

async function completeChat(messages: ChatHistoryMessage[]): Promise<string> {
  return withLlmChatRetry(() => completeChatOnce(messages), {
    onRetry: (attempt, maxRetries, error) => {
      logInfo(
        'memory',
        `summarize LLM soft retry ${attempt}/${maxRetries}`,
        error.message.slice(0, 160)
      )
    }
  })
}

/** 记忆侧通用 LLM 调用（总结 / 打分等复用） */
export async function completeMemoryChat(messages: ChatHistoryMessage[]): Promise<string> {
  return completeChat(messages)
}

export { extractJsonObject }

/** 用当前聊天 LLM 总结；失败抛错，由调用方决定放弃或改用其它路径。 */
export async function summarizeLogsWithLlm(
  logs: Array<{ role: string; content: string; timestamp?: Date | number | string }>
): Promise<LlmSummaryPayload> {
  const transcript = buildTranscript(logs)
  if (!transcript.trim()) {
    throw new Error('无对话可总结')
  }
  const messages: ChatHistoryMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `请总结以下对话，并输出 JSON（含 summary、key_facts、emotion_tags、significance、keywords）：\n\n${transcript}`
    }
  ]
  try {
    const content = await completeChat(messages)
    const parsed = parseLlmSummaryContent(content)
    return { ...parsed, engine: 'llm' }
  } catch (error) {
    logWarn('memory', 'summarizeLogsWithLlm failed', error)
    throw error
  }
}

export { SUMMARIZE_TIMEOUT_MS, LLM_CHAT_MAX_RETRIES }
