import { getTtsCloudConfigStore } from './configStore'
import { synthesizeQwenTtsHttp, type QwenFetch } from './qwenTtsClient'
import { checkCloudTtsReady } from './readiness'
import { cloudSynthesizeLock } from './synthesizeLock'
import { PREVIEW_TEXT_MAX_CHARS, type TtsCloudSynthResult } from './types'

export type PreviewCloudTtsOptions = {
  text: string
  signal?: AbortSignal
  fetchImpl?: QwenFetch
  readConfig?: () => ReturnType<typeof getTtsCloudConfigStore>['read'] extends () => infer R
    ? R
    : never
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
