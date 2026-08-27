import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createChatTtsSession } from '../../chatTtsSession'
import {
  COMPANION_TTS_SERIAL_PREFETCH_LIMIT,
  COMPANION_TTS_SYNTH_TIMEOUT_MS,
  playScreenCompanionNarrateTts,
  resolveCompanionTtsDeviceFromConfig,
  resolveCompanionTtsMode,
  resolveScreenCompanionTtsParallelLanes
} from '../companionTtsPipeline'
import { loadScreenCompanionConfig } from '../screenCompanionStore'

vi.mock('../../chatTtsSession', () => ({
  createChatTtsSession: vi.fn()
}))

vi.mock('../screenCompanionStore', () => ({
  loadScreenCompanionConfig: vi.fn()
}))

describe('resolveScreenCompanionTtsParallelLanes', () => {
  it('always returns 0', () => {
    expect(resolveScreenCompanionTtsParallelLanes()).toBe(0)
  })
})

describe('resolveCompanionTtsMode', () => {
  it('maps cpu to companion engine and gpu to chat engine', () => {
    expect(resolveCompanionTtsMode('cpu')).toBe('companion')
    expect(resolveCompanionTtsMode('gpu')).toBe('chat')
  })
})

describe('resolveCompanionTtsDeviceFromConfig', () => {
  it('defaults to cpu when config load fails', async () => {
    vi.mocked(loadScreenCompanionConfig).mockRejectedValueOnce(new Error('no ipc'))
    await expect(resolveCompanionTtsDeviceFromConfig()).resolves.toBe('cpu')
  })
})

describe('playScreenCompanionNarrateTts', () => {
  const mockSession = {
    enqueue: vi.fn(),
    enqueueAll: vi.fn(),
    markStreamComplete: vi.fn(),
    waitUntilIdle: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createChatTtsSession).mockReturnValue(mockSession)
    vi.mocked(loadScreenCompanionConfig).mockResolvedValue({
      enabled: true,
      pausedUntilMs: null,
      processBlacklist: [],
      intervalSec: 90,
      companionTtsDevice: 'cpu',
      visionBaseUrl: '',
      visionModel: '',
      hasVisionApiKey: false,
      visionApiKeySecretSave: false
    })
  })

  it('splits on pause punctuation and forces serial lanes with cpu companion mode', async () => {
    await playScreenCompanionNarrateTts('我是雪澜，一只猫娘')
    expect(createChatTtsSession).toHaveBeenCalledWith(
      expect.objectContaining({
        parallelLanes: 0,
        serialPrefetchLimit: COMPANION_TTS_SERIAL_PREFETCH_LIMIT,
        synthTimeoutMs: COMPANION_TTS_SYNTH_TIMEOUT_MS,
        ttsMode: 'companion'
      })
    )
    const items = vi.mocked(mockSession.enqueueAll).mock.calls[0]?.[0] as Array<{
      displaySegment: string
    }>
    expect(items).toHaveLength(2)
    expect(items[0]?.displaySegment).toBe('我是雪澜')
    expect(items[1]?.displaySegment).toBe('一只猫娘')
    expect(mockSession.waitUntilIdle).toHaveBeenCalled()
  })

  it('uses chat gpu engine when companionTtsDevice is gpu', async () => {
    vi.mocked(loadScreenCompanionConfig).mockResolvedValueOnce({
      enabled: true,
      pausedUntilMs: null,
      processBlacklist: [],
      intervalSec: 90,
      companionTtsDevice: 'gpu',
      visionBaseUrl: '',
      visionModel: '',
      hasVisionApiKey: false,
      visionApiKeySecretSave: false
    })
    await playScreenCompanionNarrateTts('你好')
    expect(createChatTtsSession).toHaveBeenCalledWith(
      expect.objectContaining({
        ttsMode: 'chat'
      })
    )
  })
})
