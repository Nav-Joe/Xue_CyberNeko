import type { ChatConfigView, LlmChatRequest, LlmChatResult, LlmStreamHandler } from './types'

import { llmChat } from './llmClient'

export const LLM_CHAT_MAX_RETRIES = 3
const RETRY_DELAY_MS = 800

export type ClassifiedLlmError = {
  message: string
  retryable: boolean
}

const HARD_MESSAGE_PATTERNS: RegExp[] = [
  /请先在.*配置/i,
  /请先在.*选择/i,
  /请先在.*填写/i,
  /未配置 API Key/i,
  /当前环境不支持/i,
  /未找到可用角色卡/i,
  /聊天配置未加载/i
]

const RETRYABLE_MESSAGE_PATTERNS: RegExp[] = [
  /LLM 请求超时/i,
  /AbortError/i,
  /fetch failed/i,
  /Failed to fetch/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /network/i,
  /无法连接 llama-server/i,
  /无法连接 OpenAI API/i,
  /\b(429|500|502|503|504|408)\b/,
  /busy|overload|rate.?limit|try again|temporarily|服务.*繁忙|请稍后|too many requests/i
]

const HARD_HTTP_STATUSES = new Set([400, 401, 403, 404, 422])

function extractHttpStatus(message: string): number | null {
  const openAi = message.match(/OpenAI API (\d{3})/i)
  if (openAi) return Number(openAi[1])
  const llama = message.match(/llama-server (\d{3})/i)
  if (llama) return Number(llama[1])
  const generic = message.match(/\b(\d{3})\b/)
  if (generic) return Number(generic[1])
  return null
}

function isHardAuthOrQuota(message: string, status: number | null): boolean {
  if (status === 402) return true
  if (status === 401 || status === 403) return true
  if (/invalid.*api.*key|incorrect api key|unauthorized|authentication/i.test(message)) {
    return true
  }
  if (/insufficient.*quota|余额|exceeded.*quota|payment required|billing/i.test(message)) {
    return true
  }
  return false
}

export function classifyLlmChatError(err: unknown): ClassifiedLlmError {
  const message = err instanceof Error ? err.message : String(err)

  if (HARD_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { message, retryable: false }
  }

  const status = extractHttpStatus(message)
  if (status !== null && HARD_HTTP_STATUSES.has(status)) {
    if (status === 400 && RETRYABLE_MESSAGE_PATTERNS.some((p) => p.test(message))) {
      return { message, retryable: true }
    }
    if (isHardAuthOrQuota(message, status)) {
      return { message, retryable: false }
    }
    if (status === 404) {
      return { message, retryable: false }
    }
  }

  if (isHardAuthOrQuota(message, status)) {
    return { message, retryable: false }
  }

  if (RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { message, retryable: true }
  }

  if (status !== null && status >= 500) {
    return { message, retryable: true }
  }

  return { message, retryable: false }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export type LlmChatRetryHooks = {
  onRetry?: (attempt: number, maxRetries: number, error: Error) => void
  retryDelayMs?: number
}

/** 软错误 / 网络问题自动重试，硬错误立即抛出（可供记忆总结等复用） */
export async function withLlmChatRetry<T>(
  run: (attempt: number) => Promise<T>,
  hooks?: LlmChatRetryHooks
): Promise<T> {
  let lastError = new Error('LLM 请求失败')

  for (let attempt = 0; attempt <= LLM_CHAT_MAX_RETRIES; attempt += 1) {
    try {
      return await run(attempt)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const { retryable } = classifyLlmChatError(lastError)
      if (!retryable || attempt >= LLM_CHAT_MAX_RETRIES) {
        throw lastError
      }
      hooks?.onRetry?.(attempt + 1, LLM_CHAT_MAX_RETRIES, lastError)
      await sleep(hooks?.retryDelayMs ?? RETRY_DELAY_MS)
    }
  }

  throw lastError
}

/** 软错误 / 网络问题自动重试，硬错误立即抛出 */
export async function llmChatWithRetry(
  config: ChatConfigView,
  request: LlmChatRequest,
  streamHandlerFactory?: (attempt: number) => LlmStreamHandler | undefined,
  hooks?: LlmChatRetryHooks
): Promise<LlmChatResult> {
  return withLlmChatRetry(
    (attempt) => llmChat(config, request, streamHandlerFactory?.(attempt)),
    hooks
  )
}
