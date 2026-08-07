import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatStt } from '../useChatStt'

vi.mock('../../../services/stt/sttLifecycle', () => ({
  ensureSttServiceFromMain: vi.fn(async () => ({
    ok: true as const,
    baseUrl: 'http://127.0.0.1:8767',
    reused: true
  }))
}))

vi.mock('../../../services/stt/micRecorder', () => ({
  startMicRecording: vi.fn(async () => ({
    deviceLabel: 'mock-mic',
    stop: vi.fn(async () => new Blob([new Uint8Array([1])], { type: 'audio/wav' })),
    cancel: vi.fn()
  }))
}))

vi.mock('../../../services/stt/sttClient', () => ({
  SttClientError: class SttClientError extends Error {
    code: string
    constructor(message: string, code = 'stt_error') {
      super(message)
      this.code = code
    }
  },
  resolveSttBaseUrl: vi.fn(async () => 'http://127.0.0.1:8767'),
  recognizeWav: vi.fn(async () => ({ ok: true as const, text: '你好世界' }))
}))

describe('useChatStt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('appends draft when auto-send is off', async () => {
    const appendDraft = vi.fn()
    const sendText = vi.fn()
    const setError = vi.fn()
    const autoSend = ref(false)

    const stt = useChatStt({
      isEnabled: () => true,
      isAutoSend: () => autoSend.value,
      getBaseUrl: () => '',
      getDeviceId: () => '',
      appendDraft,
      sendText,
      setError
    })

    await stt.startRecording()
    expect(stt.phase.value).toBe('recording')
    await stt.finishRecording()
    expect(appendDraft).toHaveBeenCalledWith('你好世界')
    expect(sendText).not.toHaveBeenCalled()
    expect(stt.phase.value).toBe('idle')
  })

  it('auto-sends when sttAutoSend is on', async () => {
    const { recognizeWav } = await import('../../../services/stt/sttClient')
    vi.mocked(recognizeWav).mockResolvedValueOnce({ ok: true, text: '自动发送' })

    const appendDraft = vi.fn()
    const sendText = vi.fn()
    const stt = useChatStt({
      isEnabled: () => true,
      isAutoSend: () => true,
      getBaseUrl: () => '',
      getDeviceId: () => '',
      appendDraft,
      sendText,
      setError: vi.fn()
    })

    await stt.startRecording()
    await stt.finishRecording()
    expect(sendText).toHaveBeenCalledWith('自动发送')
    expect(appendDraft).not.toHaveBeenCalled()
  })

  it('does nothing when disabled', async () => {
    const { startMicRecording } = await import('../../../services/stt/micRecorder')
    const { ensureSttServiceFromMain } = await import('../../../services/stt/sttLifecycle')
    const stt = useChatStt({
      isEnabled: () => false,
      isAutoSend: () => false,
      getBaseUrl: () => '',
      getDeviceId: () => '',
      appendDraft: vi.fn(),
      sendText: vi.fn(),
      setError: vi.fn()
    })
    await stt.startRecording()
    expect(ensureSttServiceFromMain).not.toHaveBeenCalled()
    expect(startMicRecording).not.toHaveBeenCalled()
    expect(stt.phase.value).toBe('idle')
  })

  it('surfaces ensure failure before opening mic', async () => {
    const { ensureSttServiceFromMain } = await import('../../../services/stt/sttLifecycle')
    const { startMicRecording } = await import('../../../services/stt/micRecorder')
    vi.mocked(ensureSttServiceFromMain).mockResolvedValueOnce({
      ok: false,
      detail: '未找到仓库 .venv'
    })
    const setError = vi.fn()
    const stt = useChatStt({
      isEnabled: () => true,
      isAutoSend: () => false,
      getBaseUrl: () => '',
      getDeviceId: () => '',
      appendDraft: vi.fn(),
      sendText: vi.fn(),
      setError
    })
    await stt.startRecording()
    expect(setError).toHaveBeenCalledWith('未找到仓库 .venv')
    expect(startMicRecording).not.toHaveBeenCalled()
    expect(stt.phase.value).toBe('idle')
  })

  it('refuses to start while composer is blocked (TTS/send in flight)', async () => {
    const { startMicRecording } = await import('../../../services/stt/micRecorder')
    const { ensureSttServiceFromMain } = await import('../../../services/stt/sttLifecycle')
    const setError = vi.fn()
    const stt = useChatStt({
      isEnabled: () => true,
      isAutoSend: () => false,
      getBaseUrl: () => '',
      getDeviceId: () => '',
      isBlocked: () => true,
      appendDraft: vi.fn(),
      sendText: vi.fn(),
      setError
    })
    await stt.startRecording()
    expect(setError).toHaveBeenCalledWith('请等待回复朗读结束后再语音输入')
    expect(ensureSttServiceFromMain).not.toHaveBeenCalled()
    expect(startMicRecording).not.toHaveBeenCalled()
  })
})
