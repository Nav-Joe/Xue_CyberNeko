/**
 * 渲染侧云端 TTS 后端缓存与取音。
 * Key 不进渲染；合成经 Main IPC。
 */

export type TtsBackendKind = 'local' | 'qwen'

let cachedBackend: TtsBackendKind = 'local'

export function getCachedTtsBackend(): TtsBackendKind {
  return cachedBackend
}

export function setCachedTtsBackend(backend: TtsBackendKind): void {
  cachedBackend = backend === 'qwen' ? 'qwen' : 'local'
}

export async function refreshTtsCloudBackendCache(): Promise<TtsBackendKind> {
  try {
    const result = await window.electronAPI?.getTtsCloudConfig?.()
    if (result?.ok) {
      setCachedTtsBackend(result.config.ttsBackend)
    }
  } catch {
    /* 保持缓存 */
  }
  return cachedBackend
}

export function isCachedQwenTtsBackend(): boolean {
  return cachedBackend === 'qwen'
}

export async function fetchCloudTtsBlob(text: string): Promise<Blob> {
  const piece = text.trim()
  if (!piece) {
    throw new Error('云端 TTS 文本为空')
  }
  const api = window.electronAPI?.synthesizeTtsCloud
  if (!api) {
    throw new Error('当前环境不支持云端 TTS')
  }
  const result = await api({ text: piece })
  if (!result.ok) {
    throw new Error(result.detail || '云端 TTS 合成失败')
  }
  return new Blob([result.audio], { type: result.mime || 'audio/mpeg' })
}

/** 触摸云缓存：命中返回 Blob，未命中返回 null（不打百炼） */
export async function fetchCloudTouchCacheBlob(text: string): Promise<Blob | null> {
  const piece = text.trim()
  if (!piece) return null
  const api = window.electronAPI?.getTtsCloudCacheAudio
  if (!api) return null
  const result = await api({ text: piece })
  if (!result.ok) return null
  return new Blob([result.audio], { type: result.mime || 'audio/wav' })
}

export const TTS_CLOUD_CONFIG_CHANGED_EVENT = 'tts-cloud-config-changed'

export function notifyTtsCloudConfigChanged(backend: TtsBackendKind): void {
  setCachedTtsBackend(backend)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(TTS_CLOUD_CONFIG_CHANGED_EVENT, { detail: { ttsBackend: backend } })
    )
  }
}
