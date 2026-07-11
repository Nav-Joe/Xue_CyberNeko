import {
  DEFAULT_LLAMA_BASE_URL,
  LLAMA_PROBE_BASE_URLS,
  LLAMA_PROBE_TIMEOUT_MS
} from './llmConstants'
import type { LocalLlamaEndpoint } from './types'

function buildUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of urls) {
    const url = raw.trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    result.push(url)
  }
  return result
}

/** 拉取单个 llama-server 的 /v1/models */
export async function fetchModelsAtBaseUrl(baseUrl: string): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLAMA_PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(buildUrl(baseUrl, '/v1/models'), { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const json = (await response.json()) as { data?: Array<{ id?: string }> }
    return (json.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id))
  } finally {
    clearTimeout(timer)
  }
}

/** 探测单个地址是否为可用的 llama-server */
export async function probeLocalLlamaEndpoint(baseUrl: string): Promise<LocalLlamaEndpoint> {
  try {
    const models = await fetchModelsAtBaseUrl(baseUrl)
    return {
      baseUrl,
      online: true,
      models
    }
  } catch (err) {
    return {
      baseUrl,
      online: false,
      models: [],
      error: err instanceof Error ? err.message : '连接失败'
    }
  }
}

/**
 * 扫描本机常见端口的 llama-server，返回可管理列表。
 * extraUrls：已保存的选中地址等，确保仍参与扫描。
 */
export async function detectLocalLlamaEndpoints(extraUrls: string[] = []): Promise<LocalLlamaEndpoint[]> {
  const targets = uniqueUrls([...LLAMA_PROBE_BASE_URLS, DEFAULT_LLAMA_BASE_URL, ...extraUrls])
  const results = await Promise.all(targets.map((baseUrl) => probeLocalLlamaEndpoint(baseUrl)))
  return results.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    return a.baseUrl.localeCompare(b.baseUrl)
  })
}

/** 从探测结果中取当前选中的 endpoint */
export function findSelectedLocalEndpoint(
  endpoints: LocalLlamaEndpoint[],
  selectedBaseUrl: string
): LocalLlamaEndpoint | null {
  return endpoints.find((item) => item.baseUrl === selectedBaseUrl) ?? null
}
