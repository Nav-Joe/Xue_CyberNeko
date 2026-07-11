import {
  LLAMA_SERVER_HOST,
  LLAMA_SERVER_PORT,
  LLAMA_SERVER_PORT_CANDIDATES
} from './constants'

export type LlamaEndpointState = 'llama' | 'blocked' | 'free'

function buildBaseUrl(host: string, port: number): string {
  return `http://${host}:${port}`
}

function isLlamaModelsPayload(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false
  const payload = json as { object?: string; data?: unknown; models?: unknown }
  if (payload.object === 'list' && Array.isArray(payload.data)) return true
  if (Array.isArray(payload.models)) return true
  return false
}

/** 探测端口：llama 已就绪 / 被其他程序占用 / 空闲可绑定 */
export async function probeLlamaEndpointState(baseUrl: string, timeoutMs = 3_000): Promise<LlamaEndpointState> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/models`, {
      signal: controller.signal
    })
    if (!response.ok) return 'blocked'
    const json = await response.json()
    return isLlamaModelsPayload(json) ? 'llama' : 'blocked'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const cause = err instanceof Error && 'cause' in err ? String((err as { cause?: unknown }).cause) : ''
    const combined = `${message} ${cause}`
    if (
      combined.includes('ECONNREFUSED') ||
      combined.includes('ENOTFOUND') ||
      combined.includes('ETIMEDOUT') ||
      err instanceof Error && err.name === 'AbortError'
    ) {
      return 'free'
    }
    return 'blocked'
  } finally {
    clearTimeout(timer)
  }
}

export async function resolveLlamaListenPort(
  host = LLAMA_SERVER_HOST,
  preferredPort = LLAMA_SERVER_PORT
): Promise<{ port: number; baseUrl: string; alreadyRunning: boolean }> {
  const candidates = [
    preferredPort,
    ...LLAMA_SERVER_PORT_CANDIDATES.filter((port) => port !== preferredPort)
  ]

  for (const port of candidates) {
    const baseUrl = buildBaseUrl(host, port)
    const state = await probeLlamaEndpointState(baseUrl)
    if (state === 'llama') {
      return { port, baseUrl, alreadyRunning: true }
    }
    if (state === 'free') {
      return { port, baseUrl, alreadyRunning: false }
    }
  }

  throw new Error(
    '未找到可用端口启动 llama-server（常见原因：8080 被 go-cqhttp 等程序占用）。请关闭冲突程序后重试。'
  )
}

export function isLlamaModelsResponse(json: unknown): boolean {
  return isLlamaModelsPayload(json)
}
