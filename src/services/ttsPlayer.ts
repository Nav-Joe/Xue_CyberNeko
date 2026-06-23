import { getCachedAudioUrl } from './audioCache'
import { runLipSyncWhilePlaying, stopLipSync } from './live2dLipSync'
import { isCustomCorpusTouchEnabled } from './touchModeSettings'
import { isRealtimeInferenceEnabled } from './ttsSettings'
import { stopTouchClip } from './touchClipPlayer'
import { getTtsVolume } from './ttsVolume'

const TTS_URL = 'http://127.0.0.1:8000/tts'

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

async function playLiveText(text: string, speakerId: number): Promise<void> {
  const response = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speaker_id: speakerId })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('[TTS] 合成失败:', response.status, detail)
    throw new Error(`TTS HTTP ${response.status}`)
  }

  await playBlob(await response.blob())
}

export async function speakText(text: string, speakerId = 0): Promise<void> {
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
  cleanupAudio()
  stopTouchClip()
  releaseRealtimeTouchLock()
}

export function applyVolumeToCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.volume = getTtsVolume()
  }
}
