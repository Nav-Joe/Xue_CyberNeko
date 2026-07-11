import type { ChatHistoryMessage, ChatOutputFormat } from '../../../src/services/chat/types'

function buildUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

function extractOpenAiDelta(payload: string): string | null {
  if (!payload || payload === '[DONE]') return null
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>
    }
    const delta = parsed.choices?.[0]?.delta?.content
    return typeof delta === 'string' ? delta : null
  } catch {
    return null
  }
}

function extractJsonText(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as { text?: unknown }
    return typeof parsed.text === 'string' ? parsed.text : null
  } catch {
    return null
  }
}

function parseStreamPayload(payload: string, format: ChatOutputFormat): string | null {
  if (format === 'json_content') {
    const direct = extractJsonText(payload)
    if (direct !== null) return direct
  }
  return extractOpenAiDelta(payload)
}

function normalizeJsonContentText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed) as { text?: unknown }
    if (typeof parsed.text === 'string') return parsed.text
  } catch {
    // ignore
  }
  return text
}

function parseCompletionBody(body: unknown, format: ChatOutputFormat): string {
  if (format === 'json_content') {
    const record = body as { text?: unknown }
    if (typeof record?.text === 'string') return record.text
  }
  const openAi = body as { choices?: Array<{ message?: { content?: string } }> }
  const content = openAi.choices?.[0]?.message?.content ?? ''
  if (format === 'json_content') {
    return normalizeJsonContentText(content)
  }
  return content
}

async function readStreamContent(response: Response, format: ChatOutputFormat): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trimStart()
      const delta = parseStreamPayload(payload, format)
      if (delta) accumulated += delta
    }
  }

  if (format === 'json_content') {
    return normalizeJsonContentText(accumulated)
  }
  return accumulated
}

export async function proxyOpenAiCompletion(input: {
  baseUrl: string
  apiKey: string
  messages: ChatHistoryMessage[]
  model: string
  stream: boolean
  temperature: number
  outputFormat: ChatOutputFormat
}): Promise<{ ok: true; content: string } | { ok: false; detail: string; status?: number }> {
  if (!input.apiKey.trim()) {
    return { ok: false, detail: '未配置 API Key' }
  }

  const response = await fetch(buildUrl(input.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      stream: input.stream,
      temperature: input.temperature
    })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return {
      ok: false,
      status: response.status,
      detail: detail.slice(0, 300) || `HTTP ${response.status}`
    }
  }

  if (input.stream) {
    const content = await readStreamContent(response, input.outputFormat)
    return { ok: true, content }
  }

  const json = (await response.json()) as unknown
  return { ok: true, content: parseCompletionBody(json, input.outputFormat) }
}

export async function proxyOpenAiListModels(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: true; models: string[] } | { ok: false; detail: string; status?: number }> {
  if (!apiKey.trim()) {
    return { ok: false, detail: '未配置 API Key' }
  }

  const response = await fetch(buildUrl(baseUrl, '/models'), {
    headers: { Authorization: `Bearer ${apiKey.trim()}` }
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return {
      ok: false,
      status: response.status,
      detail: detail.slice(0, 300) || `HTTP ${response.status}`
    }
  }

  const json = (await response.json()) as { data?: Array<{ id?: string }> }
  const models = (json.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id))
  return { ok: true, models }
}
