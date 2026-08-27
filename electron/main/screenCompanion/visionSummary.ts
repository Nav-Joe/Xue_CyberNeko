/**
 * 独立视觉识图短摘要（密钥与聊天配置分开）。
 * 失败重试次数与聊天 LLM 一致。
 */
import { classifyLlmChatError, LLM_CHAT_MAX_RETRIES } from '../../../src/services/chat/llmChatRetry'
import { extractOpenAiMessageContent } from '../../../src/services/chat/llmOutputParser'
import type { VisionLlmConfig } from './types'

const SUMMARY_PROMPT =
  '用一句中文概括这张屏幕截图在做什么（约 100 字以内）。' +
  '先写清主场景（例如在玩什么、界面大致状态），再酌情带上有用细节：比分、倒计时、回合、关键卡、任务进度等；细节服务于主场景，勿堆无关杂讯。' +
  '少写人名、账号、证件号等敏感信息。只输出摘要正文，不要前缀标题。'

const RETRY_DELAY_MS = 800

export type VisionSummaryAttemptResult =
  | { ok: true; summary: string; visionMs: number }
  | { ok: false; detail: string; visionMs: number }

export type VisionSummaryResult = VisionSummaryAttemptResult & { attempts: number }

export type VisionSummaryDeps = {
  fetchImpl: typeof fetch
}

function buildUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

function truncateSummary(text: string, maxChars = 160): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= maxChars) return t
  return t.slice(0, maxChars)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatFetchError(err: unknown): string {
  const parts: string[] = []
  let cur: unknown = err
  for (let i = 0; i < 4 && cur; i += 1) {
    if (cur instanceof Error) {
      parts.push(cur.message)
      const code = (cur as Error & { code?: string }).code
      if (code) parts.push(`code=${code}`)
      cur = (cur as Error & { cause?: unknown }).cause
    } else {
      parts.push(String(cur))
      break
    }
  }
  const text = parts.filter(Boolean).join(' | ').replace(/\s+/g, ' ').slice(0, 400)
  return text || 'fetch failed'
}

async function summarizeScreenImageOnce(input: {
  imageBytes: Buffer
  mimeType: 'image/jpeg' | 'image/png'
  config: VisionLlmConfig
  deps?: Partial<VisionSummaryDeps>
}): Promise<VisionSummaryAttemptResult> {
  const apiKey = input.config.apiKey.trim()
  const model = input.config.model.trim()
  const baseUrl = input.config.baseUrl.trim()
  if (!baseUrl) {
    return { ok: false, detail: '视觉配置 baseUrl 为空', visionMs: 0 }
  }
  if (!apiKey) {
    return { ok: false, detail: '视觉配置 apiKey 为空', visionMs: 0 }
  }
  if (!model) {
    return { ok: false, detail: '视觉配置 model 为空', visionMs: 0 }
  }

  const fetchImpl = input.deps?.fetchImpl ?? fetch
  const dataUrl = `data:${input.mimeType};base64,${input.imageBytes.toString('base64')}`
  const t0 = Date.now()

  try {
    const response = await fetchImpl(buildUrl(baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: SUMMARY_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } }
            ]
          }
        ]
      })
    })

    const visionMs = Date.now() - t0
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return {
        ok: false,
        visionMs,
        detail: (detail.slice(0, 300) || `HTTP ${response.status}`).replace(/\s+/g, ' ')
      }
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: unknown }>
    }
    const text = extractOpenAiMessageContent(json.choices?.[0]?.message)
    const summary = truncateSummary(text)
    if (!summary) {
      return { ok: false, detail: '视觉模型返回空摘要', visionMs }
    }
    return { ok: true, summary, visionMs }
  } catch (err) {
    return {
      ok: false,
      visionMs: Date.now() - t0,
      detail: formatFetchError(err)
    }
  }
}

/**
 * 软错误（网络/超时/5xx 等）最多再试 LLM_CHAT_MAX_RETRIES 轮；硬错误立即失败。
 */
export async function summarizeScreenImage(input: {
  imageBytes: Buffer
  mimeType: 'image/jpeg' | 'image/png'
  config: VisionLlmConfig
  deps?: Partial<VisionSummaryDeps>
}): Promise<VisionSummaryResult> {
  let last: VisionSummaryAttemptResult = {
    ok: false,
    detail: '视觉请求未执行',
    visionMs: 0
  }
  let totalMs = 0

  for (let attempt = 0; attempt <= LLM_CHAT_MAX_RETRIES; attempt += 1) {
    last = await summarizeScreenImageOnce(input)
    totalMs += last.visionMs
    if (last.ok) {
      return { ...last, visionMs: totalMs, attempts: attempt + 1 }
    }
    const { retryable } = classifyLlmChatError(new Error(last.detail))
    if (!retryable || attempt >= LLM_CHAT_MAX_RETRIES) {
      return { ...last, visionMs: totalMs, attempts: attempt + 1 }
    }
    await sleep(RETRY_DELAY_MS)
  }

  return { ...last, visionMs: totalMs, attempts: LLM_CHAT_MAX_RETRIES + 1 }
}
