import { getTtsCloudConfigStore } from './configStore'
import { synthesizeQwenTtsHttp, type QwenFetch } from './qwenTtsClient'
import { checkCloudTtsReady } from './readiness'
import { cloudSynthesizeLock } from './synthesizeLock'
import type { TtsCloudConfig, TtsCloudSynthResult } from './types'

export type SpeakCloudTtsOptions = {
  text: string
  signal?: AbortSignal
  fetchImpl?: QwenFetch
  readConfig?: () => TtsCloudConfig
}

/**
 * 热路径合成：要求 ttsBackend === 'qwen' 且凭证齐全（C3 前客户端仍返回未接入）。
 */
export async function speakCloudTts(options: SpeakCloudTtsOptions): Promise<TtsCloudSynthResult> {
  const text = options.text.trim()
  if (!text) {
    return { ok: false, detail: '合成文本为空' }
  }

  const config = options.readConfig
    ? options.readConfig()
    : getTtsCloudConfigStore().read()

  const ready = checkCloudTtsReady(config, 'speak')
  if (!ready.ok) {
    return ready
  }

  return cloudSynthesizeLock.runExclusive(
    (signal) =>
      synthesizeQwenTtsHttp({
        config,
        text,
        signal,
        fetchImpl: options.fetchImpl
      }),
    options.signal
  )
}
