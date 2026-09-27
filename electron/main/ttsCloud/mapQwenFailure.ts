/**
 * 百炼 Qwen 云端 TTS 失败态 → 人话。
 * 纯函数；不落盘、不打日志、不带 Key。
 */

export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-***')
}

function tryParseDashScopeBody(body: string): {
  code?: string
  message?: string
  status_code?: number
} | null {
  const trimmed = body.trim()
  if (!trimmed || !trimmed.startsWith('{')) return null
  try {
    return JSON.parse(trimmed) as {
      code?: string
      message?: string
      status_code?: number
    }
  } catch {
    return null
  }
}

export function mapQwenHttpFailure(status: number, bodySnippet?: string): string {
  const snippet = bodySnippet?.trim() ?? ''
  const parsed = tryParseDashScopeBody(snippet)
  const apiMsg = parsed?.message?.trim() || parsed?.code?.trim()

  if (status === 401 || status === 403) {
    return apiMsg
      ? `API Key 无效或无权限：${redactSecrets(apiMsg)}`
      : 'API Key 无效或无权限，请检查百炼密钥'
  }
  if (status === 429) {
    return '请求过于频繁，请稍后再试'
  }
  if (status === 404) {
    return '接口地址不正确，请检查 baseUrl（一般为 https://dashscope.aliyuncs.com）'
  }
  if (status >= 500) {
    return `百炼服务暂时不可用（HTTP ${status}），请稍后重试`
  }

  if (apiMsg) {
    return `百炼请求失败（HTTP ${status}）：${redactSecrets(apiMsg)}`
  }
  const short = redactSecrets(snippet).slice(0, 120)
  if (short) {
    return `百炼请求失败（HTTP ${status}）：${short}`
  }
  return `百炼请求失败（HTTP ${status}）`
}

export function mapQwenNetworkError(url: string, rawMessage: string): string {
  const safeUrl = redactSecrets(url)
  const raw = redactSecrets(rawMessage).trim() || '网络错误'
  const lower = raw.toLowerCase()
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('econn')) {
    return `连不上百炼（检查网络、系统代理或 baseUrl）。地址：${safeUrl}`
  }
  if (lower.includes('abort')) {
    return '请求已取消'
  }
  return `连不上百炼：${raw}（${safeUrl}）`
}

export function mapQwenEmptyAudio(): string {
  return '百炼未返回音频，请检查模型名与云端音色 ID'
}

export function mapQwenEnrollmentFailure(detail: string, label = '官方样本云克隆'): string {
  const safe = redactSecrets(detail).trim()
  return safe ? `${label}失败：${safe}` : `${label}失败`
}

export function mapQwenDesignFailure(detail: string): string {
  return mapQwenEnrollmentFailure(detail, '声音设计')
}
