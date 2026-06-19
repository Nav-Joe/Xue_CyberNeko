import { getTtsVolume } from './ttsVolume'

const TTS_URL = 'http://127.0.0.1:8000/tts'

let currentAudio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null

function cleanupAudio(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

export async function speakText(text: string, speakerId = 0): Promise<void> {
  cleanupAudio()

  let response: Response
  try {
    response = await fetch(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speaker_id: speakerId })
    })
  } catch (error) {
    console.error('[TTS] 无法连接语音服务，请先运行「启动TTS.bat」或 python tts_voice/tts_server.py', error)
    throw error
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('[TTS] 合成失败:', response.status, detail)
    throw new Error(`TTS HTTP ${response.status}`)
  }

  const blob = await response.blob()
  currentObjectUrl = URL.createObjectURL(blob)
  currentAudio = new Audio(currentObjectUrl)
  currentAudio.volume = getTtsVolume()

  currentAudio.addEventListener(
    'ended',
    () => {
      cleanupAudio()
    },
    { once: true }
  )

  try {
    await currentAudio.play()
  } catch (error) {
    cleanupAudio()
    console.error('[TTS] 播放失败:', error)
    throw error
  }
}

export function stopSpeaking(): void {
  cleanupAudio()
}

export function applyVolumeToCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.volume = getTtsVolume()
  }
}
