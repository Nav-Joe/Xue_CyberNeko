import type { AppFetch } from './appFetch'
import { getTtsCloudConfigStore } from './configStore'
import { resolveCloudTtsProvider } from './provider'
import './providers/qwenProvider'
import './providers/seedProvider'
import './providers/edgeProvider'
import { checkCloudTtsReady } from './readiness'
import { cloudSynthesizeLock } from './synthesizeLock'
import type { TtsCloudConfig, TtsCloudSynthResult } from './types'

export type SpeakCloudTtsOptions = {
  text: string
  signal?: AbortSignal
  fetchImpl?: AppFetch
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

  const provider = resolveCloudTtsProvider(config)
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
