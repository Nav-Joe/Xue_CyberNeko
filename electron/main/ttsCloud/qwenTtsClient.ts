import { formatFetchError, getAppFetch, type AppFetch } from './appFetch'
import {
  mapQwenEmptyAudio,
  mapQwenHttpFailure,
  mapQwenNetworkError
} from './mapQwenFailure'
import { resolveActiveQwenVoice } from './activeVoice'
import { buildQwenMultimodalGenerationUrl } from './readiness'
import type { TtsCloudConfig, TtsCloudSynthResult } from './types'

export type QwenFetch = AppFetch

export type SynthesizeQwenInput = {
  config: TtsCloudConfig
  text: string
  signal?: AbortSignal
  fetchImpl?: QwenFetch
}

function mimeFromUrlOrHeader(url: string, header: string | null): string {
  const raw = (header ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (raw.startsWith('audio/')) return raw
  const lower = url.toLowerCase()
  if (lower.includes('.mp3')) return 'audio/mpeg'
  if (lower.includes('.wav')) return 'audio/wav'
  return 'audio/wav'
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

/**
 * C3：百炼非实时合成 B1。
 * 响应多为 audio.url（24h）；有 base64 data 时优先用 data。
 */
export async function synthesizeQwenTtsHttp(
  input: SynthesizeQwenInput
): Promise<TtsCloudSynthResult> {
  const text = input.text.trim()
  if (!text) {
    return { ok: false, detail: '合成文本为空' }
  }

  const { qwen } = input.config
  const active = resolveActiveQwenVoice(input.config)
  if (!active) {
    return { ok: false, detail: '尚未选择有效的云端音色' }
  }
  const model = active.model
  const voice = active.voiceId
  const url = buildQwenMultimodalGenerationUrl(qwen.baseUrl)
  const fetchImpl = input.fetchImpl ?? getAppFetch()

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${qwen.apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: {
          text,
          voice,
          language_type: 'Chinese'
        }
      }),
      signal: input.signal
    })
  } catch (error) {
    if (input.signal?.aborted) {
      return { ok: false, detail: '合成已取消' }
    }
    return {
      ok: false,
      detail: mapQwenNetworkError(url, formatFetchError(error))
    }
  }

  const bodyText = await response.text().catch(() => '')
  if (!response.ok) {
    return { ok: false, detail: mapQwenHttpFailure(response.status, bodyText) }
  }

  let audioDataB64 = ''
  let audioUrl = ''
  try {
    const parsed = JSON.parse(bodyText) as {
      code?: string
      message?: string
      status_code?: number
      output?: { audio?: { data?: string; url?: string } }
    }
    if (parsed.code && String(parsed.code).trim()) {
      return {
        ok: false,
        detail: mapQwenHttpFailure(parsed.status_code || 400, bodyText)
      }
    }
    audioDataB64 = typeof parsed.output?.audio?.data === 'string' ? parsed.output.audio.data.trim() : ''
    audioUrl = typeof parsed.output?.audio?.url === 'string' ? parsed.output.audio.url.trim() : ''
  } catch {
    return { ok: false, detail: '百炼返回了无法解析的数据' }
  }

  if (audioDataB64) {
    try {
      const bytes = Uint8Array.from(Buffer.from(audioDataB64, 'base64'))
      if (bytes.byteLength === 0) {
        return { ok: false, detail: mapQwenEmptyAudio() }
      }
      return { ok: true, audio: toArrayBuffer(bytes), mime: 'audio/wav' }
    } catch {
      return { ok: false, detail: '百炼音频 Base64 无法解码' }
    }
  }

  if (!audioUrl) {
    return { ok: false, detail: mapQwenEmptyAudio() }
  }

  let audioRes: Response
  try {
    audioRes = await fetchImpl(audioUrl, { method: 'GET', signal: input.signal })
  } catch (error) {
    if (input.signal?.aborted) {
      return { ok: false, detail: '合成已取消' }
    }
    return {
      ok: false,
      detail: mapQwenNetworkError(audioUrl, formatFetchError(error))
    }
  }

  if (!audioRes.ok) {
    return {
      ok: false,
      detail: mapQwenHttpFailure(audioRes.status, '下载合成音频失败')
    }
  }

  const bytes = new Uint8Array(await audioRes.arrayBuffer())
  if (bytes.byteLength === 0) {
    return { ok: false, detail: mapQwenEmptyAudio() }
  }

  return {
    ok: true,
    audio: toArrayBuffer(bytes),
    mime: mimeFromUrlOrHeader(audioUrl, audioRes.headers.get('content-type'))
  }
}
