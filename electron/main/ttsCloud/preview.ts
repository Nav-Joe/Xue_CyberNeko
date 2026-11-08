import type { AppFetch } from './appFetch'
import { getTtsCloudConfigStore } from './configStore'
import { getCloudTtsProvider } from './provider'
import './providers/qwenProvider'
import './providers/seedProvider'
import './providers/edgeProvider'
import { checkCloudTtsReady } from './readiness'
import { cloudSynthesizeLock } from './synthesizeLock'
import { PREVIEW_TEXT_MAX_CHARS, type TtsCloudConfig, type TtsCloudSynthResult } from './types'

export type PreviewCloudTtsOptions = {
  text: string
  signal?: AbortSignal
  fetchImpl?: AppFetch
  readConfig?: () => TtsCloudConfig
}

/**
 * 设置页试听：凭证+voiceId 就绪即可；不要求已切到云端模式。
 * C3 前仍返回「合成未接入」。
 */
export async function previewCloudTts(options: PreviewCloudTtsOptions): Promise<TtsCloudSynthResult> {
  const text = options.text.trim()
  if (!text) {
    return { ok: false, detail: '试听文本为空' }
  }
  if (text.length > PREVIEW_TEXT_MAX_CHARS) {
    return {
      ok: false,
      detail: `试听文本过长（最多 ${PREVIEW_TEXT_MAX_CHARS} 字）`
    }
  }

  const config = options.readConfig
    ? options.readConfig()
    : getTtsCloudConfigStore().read()

  const ready = checkCloudTtsReady(config, 'preview')
  if (!ready.ok) {
    return ready
  }

  const providerId = config.ttsBackend === 'seed' || config.ttsBackend === 'edge' ? config.ttsBackend : 'qwen'
  const provider = getCloudTtsProvider(providerId)
  if (!provider) {
    return { ok: false, detail: '当前云端语音服务不可用' }
  }

  return cloudSynthesizeLock.runExclusive(
    (signal) =>
      provider.synthesize({
        config,
        text,
        signal,
        fetchImpl: options.fetchImpl
      }),
    options.signal
  )
}
