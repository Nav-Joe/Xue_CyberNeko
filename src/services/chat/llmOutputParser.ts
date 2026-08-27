import type { ChatOutputFormat } from './types'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** 从 `{ "text": "..." }` 或嵌套 content 中提取文本 */
export function extractJsonContentText(value: unknown): string | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.text === 'string') return record.text
  return null
}

/** 从 OpenAI message.content 提取文本（string 或 multimodal parts 数组） */
export function extractOpenAiMessageContent(message: unknown): string {
  const record = asRecord(message)
  if (!record) return ''
  const content = record.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      const item = asRecord(part)
      if (!item) return ''
      if (typeof item.text === 'string') return item.text
      return ''
    })
    .join('')
}

/** OpenAI chat completion 非流式响应 */
export function parseOpenAiCompletionBody(body: unknown): string {
  const root = asRecord(body)
  const choices = root?.choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = asRecord(choices[0])
  return extractOpenAiMessageContent(first?.message)
}

/** OpenAI SSE data 行中的 delta.content */
export function parseOpenAiStreamPayload(payload: string): string | null {
  if (!payload || payload === '[DONE]') return null
  try {
    const parsed = JSON.parse(payload) as unknown
    const root = asRecord(parsed)
    const choices = root?.choices
    if (!Array.isArray(choices) || choices.length === 0) return null
    const first = asRecord(choices[0])
    const delta = asRecord(first?.delta)
    return typeof delta?.content === 'string' ? delta.content : null
  } catch {
    return null
  }
}

/** 按 outputFormat 解析非流式 HTTP JSON 体 */
export function parseCompletionBody(body: unknown, format: ChatOutputFormat): string {
  if (format === 'json_content') {
    const direct = extractJsonContentText(body)
    if (direct !== null) return direct
  }
  const openAiText = parseOpenAiCompletionBody(body)
  if (format === 'json_content') {
    return normalizeJsonContentAssistantText(openAiText)
  }
  return openAiText
}

/** assistant 文本在 json_content 模式下可能是 JSON 字符串 */
export function normalizeJsonContentAssistantText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed) as unknown
    const extracted = extractJsonContentText(parsed)
    if (extracted !== null) return extracted
  } catch {
    // 非 JSON 则原样返回
  }
  return text
}

/** 解析 SSE `data:` 行（不含前缀） */
export function parseStreamPayload(payload: string, format: ChatOutputFormat): string | null {
  if (format === 'json_content') {
    if (!payload || payload === '[DONE]') return null
    try {
      const parsed = JSON.parse(payload) as unknown
      const direct = extractJsonContentText(parsed)
      if (direct !== null) return direct
    } catch {
      // fall through to OpenAI delta
    }
  }
  return parseOpenAiStreamPayload(payload)
}

/** 聚合流式 delta 并按 outputFormat 归一化 */
export function finalizeStreamContent(accumulated: string, format: ChatOutputFormat): string {
  if (format === 'json_content') {
    return normalizeJsonContentAssistantText(accumulated)
  }
  return accumulated
}
