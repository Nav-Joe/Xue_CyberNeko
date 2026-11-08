import { formatFetchError, getAppFetch, type AppFetch } from './appFetch'
import { mapQwenHttpFailure, mapQwenNetworkError } from './mapQwenFailure'
import type { TtsCloudConfig, TtsCloudSynthResult } from './types'

export type SynthesizeSeedInput = {
  config: TtsCloudConfig
  text: string
  signal?: AbortSignal
  fetchImpl?: AppFetch
}

function decodeAudio(data: string): Uint8Array | null {
  const trimmed = data.trim()
  if (!trimmed) return null
  try {
    return Uint8Array.from(Buffer.from(trimmed, 'base64'))
  } catch {
    return null
  }
}

function toArrayBuffer(parts: Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    merged.set(part, offset)
    offset += part.byteLength
  }
  return merged.buffer
}

/** 单向流式接口会把多段 JSON 分块返回，音频在 data 的 base64 里。 */
export function collectSeedAudioChunks(bodyText: string): { audio: Uint8Array[] } | { detail: string } {
  const lines = bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const payloads = lines.length > 0 ? lines : [bodyText.trim()].filter(Boolean)
  const audio: Uint8Array[] = []
  let failure = ''

  for (const payload of payloads) {
    let parsed: { code?: number; message?: string; data?: string | null }
    try {
      parsed = JSON.parse(payload) as { code?: number; message?: string; data?: string | null }
    } catch {
      return { detail: 'Seed 返回了无法解析的数据' }
    }
    const bytes = typeof parsed.data === 'string' ? decodeAudio(parsed.data) : null
    if (bytes && bytes.byteLength > 0) {
      audio.push(bytes)
    }
    if (typeof parsed.code === 'number' && parsed.code !== 0 && !bytes) {
      failure = parsed.message?.trim() || `Seed 合成失败（${parsed.code}）`
    }
  }

  if (audio.length === 0) {
    return { detail: failure || 'Seed 未返回音频' }
  }
  return { audio }
}

export async function synthesizeSeedTtsHttp(input: SynthesizeSeedInput): Promise<TtsCloudSynthResult> {
  const text = input.text.trim()
  if (!text) return { ok: false, detail: '合成文本为空' }

  const seed = input.config.seed
  const apiKey = seed.apiKey.trim()
  if (!apiKey) return { ok: false, detail: '请先填写 Seed API Key' }

  const voice = seed.voices.find((item) => item.id === seed.activeVoiceLocalId)
  if (!voice?.speaker.trim()) return { ok: false, detail: '请先选择一条 Seed 声线' }

  const root = (seed.baseUrl.trim() || 'https://openspeech.bytedance.com').replace(/\/+$/, '')
  const url = `${root}/api/v3/tts/unidirectional`
  const fetchImpl = input.fetchImpl ?? getAppFetch()

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'X-Api-Resource-Id': seed.resourceId.trim() || 'seed-tts-2.0',
        'X-Api-Request-Id': crypto.randomUUID()
      },
      body: JSON.stringify({
        req_params: {
          text,
          speaker: voice.speaker.trim(),
          audio_params: {
            format: 'mp3',
            sample_rate: 24000
          }
        }
      }),
      signal: input.signal
    })
  } catch (error) {
    if (input.signal?.aborted) return { ok: false, detail: '合成已取消' }
    return { ok: false, detail: mapQwenNetworkError(url, formatFetchError(error)) }
  }

  const bodyText = await response.text().catch(() => '')
  if (!response.ok) {
    return { ok: false, detail: mapQwenHttpFailure(response.status, bodyText) }
  }

  const collected = collectSeedAudioChunks(bodyText)
  if ('detail' in collected) return { ok: false, detail: collected.detail }
  return { ok: true, audio: toArrayBuffer(collected.audio), mime: 'audio/mpeg' }
}
