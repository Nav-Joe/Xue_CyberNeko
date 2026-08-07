import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'

import { startMicRecording, type MicRecorderHandle } from '../../services/stt/micRecorder'
import { ensureSttServiceFromMain } from '../../services/stt/sttLifecycle'
import {
  recognizeWav,
  resolveSttBaseUrl,
  SttClientError
} from '../../services/stt/sttClient'

export type ChatSttPhase = 'idle' | 'recording' | 'recognizing'

export type UseChatSttOptions = {
  isEnabled: () => boolean
  isAutoSend: () => boolean
  getBaseUrl: () => string
  /** chat-config.sttDeviceId；空 = 系统默认 */
  getDeviceId: () => string
  /** 为 true 时禁止开录（如对话 TTS/发送尚未结束） */
  isBlocked?: () => boolean
  appendDraft: (text: string) => void
  sendText: (text: string) => void | Promise<void>
  setError: (message: string) => void
}

/**
 * 聊天窗 STT 状态机：idle → recording → recognizing → idle。
 * 独立于 useChatSession，以免录音状态机把发送热路径文件胀破。
 */
export function useChatStt(options: UseChatSttOptions) {
  const phase = ref<ChatSttPhase>('idle')
  const statusHint = ref('')
  const preparing = ref(false)
  /** 录音电平 0..1；仅 recording 有意义 */
  const level = ref(0)
  let recorder: MicRecorderHandle | null = null
  let cachedBaseUrl = ''

  const isRecording = computed(() => phase.value === 'recording')
  const isRecognizing = computed(() => phase.value === 'recognizing')
  const inputLocked = computed(
    () => preparing.value || phase.value === 'recording' || phase.value === 'recognizing'
  )

  function resetToIdle(): void {
    phase.value = 'idle'
    statusHint.value = ''
    preparing.value = false
    level.value = 0
  }

  async function startRecording(): Promise<void> {
    if (!options.isEnabled()) return
    if (phase.value !== 'idle' || preparing.value) return
    // 开 TTS 时发送/朗读未结束禁止开录，避免 stopSpeaking 打断合成造成错乱
    if (options.isBlocked?.()) {
      options.setError('请等待回复朗读结束后再语音输入')
      return
    }

    options.setError('')
    preparing.value = true
    level.value = 0
    statusHint.value = '准备中'

    try {
      const ensured = await ensureSttServiceFromMain()
      if (!ensured.ok) {
        resetToIdle()
        options.setError(ensured.detail)
        return
      }
      if (!options.getBaseUrl().trim()) {
        cachedBaseUrl = ensured.baseUrl
      }

      recorder = await startMicRecording({
        deviceId: options.getDeviceId(),
        onLevel: (n) => {
          level.value = n
        }
      })
      phase.value = 'recording'
      preparing.value = false
      statusHint.value = recorder.deviceLabel ? `录音 · ${recorder.deviceLabel}` : ''
    } catch (err) {
      recorder = null
      resetToIdle()
      options.setError(err instanceof Error ? err.message : '无法开始录音')
    }
  }

  async function finishRecording(): Promise<void> {
    if (phase.value !== 'recording' || !recorder) return

    const handle = recorder
    recorder = null
    phase.value = 'recognizing'
    level.value = 0
    statusHint.value = '识别中'

    try {
      const wav = await handle.stop()
      const configured = options.getBaseUrl()
      let base = cachedBaseUrl
      if (!base || configured.trim()) {
        base = await resolveSttBaseUrl(configured)
        if (!configured.trim()) {
          cachedBaseUrl = base
        }
      }

      let result
      try {
        result = await recognizeWav(base, wav)
      } catch (err) {
        // 缓存可能过期（侧车换端口）；清缓存再扫一次
        if (err instanceof SttClientError && err.code === 'unreachable' && !configured.trim()) {
          cachedBaseUrl = ''
          base = await resolveSttBaseUrl('')
          cachedBaseUrl = base
          result = await recognizeWav(base, wav)
        } else {
          throw err
        }
      }

      const text = result.text.trim()
      if (!text) {
        options.setError('没听清，请再说一次')
        return
      }

      if (options.isAutoSend()) {
        await options.sendText(text)
      } else {
        options.appendDraft(text)
      }
    } catch (err) {
      if (err instanceof SttClientError && err.code === 'unreachable') {
        cachedBaseUrl = ''
      }
      options.setError(err instanceof Error ? err.message : '语音识别失败')
    } finally {
      resetToIdle()
    }
  }

  function cancelRecording(): void {
    if (recorder) {
      recorder.cancel()
      recorder = null
    }
    resetToIdle()
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      cancelRecording()
    })
  }

  return {
    phase,
    statusHint,
    preparing,
    level,
    isRecording,
    isRecognizing,
    inputLocked,
    startRecording,
    finishRecording,
    cancelRecording
  }
}
