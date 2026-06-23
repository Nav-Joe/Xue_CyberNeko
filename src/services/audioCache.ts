const TTS_BASE = 'http://127.0.0.1:8000'

export interface CacheStatus {
  ready: boolean
  building: boolean
  stale: boolean
  prewarm_active?: boolean
  line_count?: number
  variant_count?: number
  prewarm_work_lines?: number
  prewarm_work_total?: number
  progress: { done: number; total: number }
  error: string | null
  message?: string
  touch_mode?: string
}

export async function fetchCacheStatus(): Promise<CacheStatus | null> {
  try {
    const response = await fetch(`${TTS_BASE}/cache/status`)
    if (!response.ok) {
      return null
    }
    return (await response.json()) as CacheStatus
  } catch {
    return null
  }
}

export function getCachedAudioUrl(text: string, variant?: number): string {
  const params = new URLSearchParams({ text })
  if (variant !== undefined) {
    params.set('variant', String(variant))
  }
  return `${TTS_BASE}/cache/audio?${params.toString()}`
}
