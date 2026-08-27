import { abortActiveChatTtsSession } from './chatTtsSessionRegistry'
import { getCachedAudioUrl } from './audioCache'
import { runLipSyncWhilePlaying, stopLipSync } from './live2dLipSync'
import { isCustomCorpusTouchEnabled } from './touchModeSettings'
import { isRealtimeInferenceEnabled } from './ttsSettings'
import { stopTouchClip } from './touchClipPlayer'
import { getTtsVolume } from './ttsVolume'

const TTS_URL = 'http://127.0.0.1:8000/tts'
const TTS_BATCH_URL = 'http://127.0.0.1:8000/tts/batch'

export type SpeakTextOptions = {
  /** touch：触摸语料；chat：文字聊天（不受触摸模式限制） */
  channel?: 'touch' | 'chat'
  speakerId?: number
}

export type TtsFetchMode = 'default' | 'chat' | 'companion'

let currentAudio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null
/** 实时推理：从 /tts 请求到音频播完（或失败）之前忽略重复点击 */
let realtimeTouchInFlight = false

export function isRealtimeTouchBusy(): boolean {
  return realtimeTouchInFlight
}

function releaseRealtimeTouchLock(): void {
  realtimeTouchInFlight = false
}

if (typeof window !== 'undefined') {
  window.addEventListener('tts-realtime-changed', () => {
    releaseRealtimeTouchLock()
  })
}

function cleanupAudio(): void {
  stopLipSync()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

function waitForAudioPlaybackEnd(audio: HTMLAudioElement): Promise<void> {
  if (audio.ended) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('pause', onPause)
    }

    const onEnded = (): void => {
      cleanup()
      resolve()
    }

    const onError = (): void => {
      cleanup()
      reject(new Error('audio playback error'))
    }

    const onPause = (): void => {
      // stopSpeaking / 切换音频时会 pause；视为本次播放结束
      if (audio.ended || audio.currentTime > 0) {
        cleanup()
        resolve()
      }
    }

    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    audio.addEventListener('pause', onPause)
  })
}

async function playBlob(blob: Blob): Promise<void> {
  cleanupAudio()
  currentObjectUrl = URL.createObjectURL(blob)
  currentAudio = new Audio(currentObjectUrl)
  currentAudio.volume = getTtsVolume()

  const audio = currentAudio
  void runLipSyncWhilePlaying(audio).catch(() => {})

  try {
    await audio.play()
    await waitForAudioPlaybackEnd(audio)
  } catch (error) {
    cleanupAudio()
    throw error
  }

  cleanupAudio()
}

async function playCachedText(text: string): Promise<boolean> {
  try {
    const response = await fetch(getCachedAudioUrl(text))
    if (!response.ok) {
      return false
    }
    await playBlob(await response.blob())
    return true
  } catch {
    return false
  }
}

export type ChatTtsFetchOptions = {
  order?: number
  /** 0=串行；2-4=并行并路 */
  parallelLanes?: number
}

async function fetchLiveTtsBlob(
  text: string,
  speakerId: number,
  mode: TtsFetchMode = 'default',
  options?: ChatTtsFetchOptions
): Promise<Blob> {
  const payload: Record<string, unknown> = { text, speaker_id: speakerId, mode }
  if (mode === 'chat' || mode === 'companion') {
    if (options?.order !== undefined) payload.order = options.order
    payload.parallel_lanes = options?.parallelLanes ?? 0
  }
  const response = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('[TTS] 合成失败:', response.status, detail)
    throw new Error(`TTS HTTP ${response.status}`)
  }

  return response.blob()
}

export async function fetchChatTtsBlob(
  text: string,
  speakerId = 0,
  order?: number,
  parallelLanes = 0
): Promise<Blob> {
  return fetchLiveTtsBlob(text, speakerId, 'chat', { order, parallelLanes })
}

/** 屏幕陪玩旁白：走 TTS 侧车 CPU 引擎，不占 GPU 显存 */
export async function fetchCompanionTtsBlob(
  text: string,
  speakerId = 0,
  order?: number
): Promise<Blob> {
  return fetchLiveTtsBlob(text, speakerId, 'companion', { order, parallelLanes: 0 })
}

function base64ToBlob(base64: string, mimeType = 'audio/wav'): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

export async function fetchChatTtsBatch(texts: string[], speakerId = 0): Promise<Blob[]> {
  const payload = texts.map((text) => text.trim()).filter(Boolean)
  if (payload.length === 0) return []
  if (payload.length === 1) {
    return [await fetchChatTtsBlob(payload[0], speakerId)]
  }

  const response = await fetch(TTS_BATCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: payload, speaker_id: speakerId })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('[TTS] batch 合成失败:', response.status, detail)
    throw new Error(`TTS batch HTTP ${response.status}`)
  }

  const json = (await response.json()) as { audios_base64?: string[] }
  const chunks = json.audios_base64 ?? []
  if (chunks.length !== payload.length) {
    throw new Error(`TTS batch 返回数量不匹配: expected=${payload.length} got=${chunks.length}`)
  }
  return chunks.map((chunk) => base64ToBlob(chunk))
}

export async function playChatAudioBlob(blob: Blob): Promise<void> {
  await playBlob(blob)
}

async function playLiveText(text: string, speakerId: number): Promise<void> {
  await playBlob(await fetchLiveTtsBlob(text, speakerId))
}

/**
 * @deprecated 聊天分段请使用 createChatTtsSession
 */
export async function speakChatSegment(ttsText: string, onReady: () => void): Promise<void> {
  const piece = ttsText.trim()
  if (!piece) {
    onReady()
    return
  }

  cleanupAudio()
  try {
    const blob = await fetchLiveTtsBlob(piece, 0)
    onReady()
    await playBlob(blob)
  } catch (error) {
    onReady()
    console.error('[TTS] 聊天分段朗读失败，请确认语音服务已启动', error)
  }
}

function resolveSpeakOptions(speakerIdOrOptions?: number | SpeakTextOptions): {
  channel: 'touch' | 'chat'
  speakerId: number
} {
  if (typeof speakerIdOrOptions === 'number') {
    return { channel: 'touch', speakerId: speakerIdOrOptions }
  }
  return {
    channel: speakerIdOrOptions?.channel ?? 'touch',
    speakerId: speakerIdOrOptions?.speakerId ?? 0
  }
}

export async function speakText(text: string, speakerIdOrOptions?: number | SpeakTextOptions): Promise<void> {
  const { channel, speakerId } = resolveSpeakOptions(speakerIdOrOptions)

  if (channel === 'chat') {
    cleanupAudio()
    try {
      await playLiveText(text, speakerId)
    } catch (error) {
      console.error('[TTS] 聊天朗读失败，请确认语音服务已启动', error)
      throw error
    }
    return
  }

  if (!isCustomCorpusTouchEnabled()) {
    console.warn('[TTS] 当前为精选音频模式，speakText 已被跳过')
    return
  }

  if (isRealtimeInferenceEnabled()) {
    if (realtimeTouchInFlight) {
      console.info('[TTS] 实时推理进行中，已忽略重复点击')
      return
    }
    realtimeTouchInFlight = true
    try {
      await playLiveText(text, speakerId)
    } catch (error) {
      console.error('[TTS] 无法连接语音服务，请先运行「启动.bat」或 python tts_voice/tts_server.py', error)
      throw error
    } finally {
      releaseRealtimeTouchLock()
    }
    return
  }

  cleanupAudio()

  const cached = await playCachedText(text)
  if (cached) {
    return
  }
  console.info('[TTS] 缓存未命中，回退到实时推理:', text)

  try {
    await playLiveText(text, speakerId)
  } catch (error) {
    console.error('[TTS] 无法连接语音服务，请先运行「启动.bat」或 python tts_voice/tts_server.py', error)
    throw error
  }
}

export function stopSpeaking(): void {
  abortActiveChatTtsSession()
  cleanupAudio()
  stopTouchClip()
  releaseRealtimeTouchLock()
}

export function applyVolumeToCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.volume = getTtsVolume()
  }
}
