import { beforeEach, describe, expect, it, vi } from 'vitest'

const isCachedQwenTtsBackend = vi.fn(() => false)
const fetchCloudTtsBlob = vi.fn(async () => new Blob(['cloud']))
const fetchCloudTouchCacheBlob = vi.fn(async () => null)

vi.mock('../ttsCloudSpeech', () => ({
  isCachedQwenTtsBackend: () => isCachedQwenTtsBackend(),
  fetchCloudTtsBlob: (...args: unknown[]) => fetchCloudTtsBlob(...args),
  fetchCloudTouchCacheBlob: (...args: unknown[]) => fetchCloudTouchCacheBlob(...args)
}))

vi.mock('../touchModeSettings', () => ({
  isCustomCorpusTouchEnabled: () => true
}))

vi.mock('../ttsSettings', () => ({
  isRealtimeInferenceEnabled: () => false
}))

vi.mock('../live2dLipSync', () => ({
  runLipSyncWhilePlaying: async () => {},
  stopLipSync: () => {}
}))

vi.mock('../touchClipPlayer', () => ({
  stopTouchClip: () => {}
}))

vi.mock('../ttsVolume', () => ({
  getTtsVolume: () => 1
}))

vi.mock('../chatTtsSessionRegistry', () => ({
  abortActiveChatTtsSession: () => {}
}))

vi.mock('../audioCache', () => ({
  getCachedAudioUrl: () => 'http://127.0.0.1:8000/cache/audio?text=x'
}))

import { fetchChatTtsBlob, fetchCompanionTtsBlob, speakText } from '../ttsPlayer'

describe('ttsPlayer cloud route', () => {
  beforeEach(() => {
    isCachedQwenTtsBackend.mockReset()
    isCachedQwenTtsBackend.mockReturnValue(false)
    fetchCloudTtsBlob.mockClear()
    fetchCloudTouchCacheBlob.mockClear()
    fetchCloudTouchCacheBlob.mockResolvedValue(null)
  })

  it('fetchChatTtsBlob uses cloud when backend cached as qwen', async () => {
    isCachedQwenTtsBackend.mockReturnValue(true)
    const blob = await fetchChatTtsBlob('hi')
    expect(fetchCloudTtsBlob).toHaveBeenCalledWith('hi')
    expect(await blob.text()).toBe('cloud')
  })

  it('fetchCompanionTtsBlob uses cloud when backend cached as qwen', async () => {
    isCachedQwenTtsBackend.mockReturnValue(true)
    const blob = await fetchCompanionTtsBlob('hi')
    expect(fetchCloudTtsBlob).toHaveBeenCalledWith('hi')
    expect(await blob.text()).toBe('cloud')
  })

  it('speakText cloud touch uses cache only and does not synthesize on miss', async () => {
    isCachedQwenTtsBackend.mockReturnValue(true)
    fetchCloudTouchCacheBlob.mockResolvedValue(null)
    await speakText('未缓存台词')
    expect(fetchCloudTouchCacheBlob).toHaveBeenCalledWith('未缓存台词')
    expect(fetchCloudTtsBlob).not.toHaveBeenCalled()
  })
})
