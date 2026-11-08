import { formatFetchError, getAppFetch, type AppFetch } from './appFetch'
import {
  mapQwenEnrollmentFailure,
  mapQwenHttpFailure,
  mapQwenNetworkError
} from './mapQwenFailure'
import { ALI_TTS_URL_DENIED } from './aliTtsUrl'
import { buildQwenEnrollmentUrl } from './readiness'
import { DEFAULT_QWEN_VC_MODEL, type TtsCloudConfig } from './types'
import { sanitizePreferredName, toAudioTtsPrefix } from './activeVoice'

export type EnrollVcHttpOk = { ok: true; voiceId: string; model: string }
export type EnrollVcHttpErr = { ok: false; detail: string }
export type EnrollVcHttpResult = EnrollVcHttpOk | EnrollVcHttpErr

export type EnrollVcHttpInput = {
  config: TtsCloudConfig
  wavBytes: Uint8Array
  mime: string
  referenceText?: string
  preferredName: string
  signal?: AbortSignal
  fetchImpl?: AppFetch
  /** 失败文案前缀 */
  failureLabel?: string
}

/**
 * 百炼 VC enrollment（官方 / 自定义样本共用 HTTP）。
 */
export async function enrollQwenVcHttp(input: EnrollVcHttpInput): Promise<EnrollVcHttpResult> {
  const apiKey = input.config.qwen.apiKey.trim()
  if (!apiKey) {
    return { ok: false, detail: '请先在聊天设置填写百炼 API Key' }
  }

  const model = input.config.qwen.vcModel.trim() || DEFAULT_QWEN_VC_MODEL
  const fetchImpl = input.fetchImpl ?? getAppFetch()
  const label = input.failureLabel ?? '云克隆'
  const wrap = (detail: string) => mapQwenEnrollmentFailure(detail, label)
  const url = buildQwenEnrollmentUrl(input.config.qwen.baseUrl)
  if (!url) return { ok: false, detail: wrap(ALI_TTS_URL_DENIED) }

  const base64 = Buffer.from(input.wavBytes).toString('base64')
  const dataUri = `data:${input.mime};base64,${base64}`
  const preferred = toAudioTtsPrefix(sanitizePreferredName(input.preferredName, 'xuevc'), 'xuevc')
  const bodyInput: Record<string, unknown> = {
    action: 'create_voice',
    target_model: model,
    prefix: preferred,
    audio: dataUri,
    language_hints: ['zh']
  }

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'voice-enrollment',
        input: bodyInput
      }),
      signal: input.signal
    })
  } catch (error) {
    if (input.signal?.aborted) {
      return { ok: false, detail: `${label}已取消` }
    }
    return {
      ok: false,
      detail: wrap(mapQwenNetworkError(url, formatFetchError(error)))
    }
  }

  const bodyText = await response.text().catch(() => '')
  if (!response.ok) {
    return { ok: false, detail: wrap(mapQwenHttpFailure(response.status, bodyText)) }
  }

  let voiceId = ''
  try {
    const parsed = JSON.parse(bodyText) as {
      output?: { voice?: string; voice_id?: string }
      code?: string
      message?: string
    }
    if (parsed.code && parsed.message) {
      return { ok: false, detail: wrap(parsed.message) }
    }
    voiceId = (parsed.output?.voice_id || parsed.output?.voice || '').trim()
  } catch {
    return { ok: false, detail: wrap('返回无法解析') }
  }

  if (!voiceId) {
    return { ok: false, detail: wrap('未返回 voice ID') }
  }

  return { ok: true, voiceId, model }
}
