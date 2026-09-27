import { describe, expect, it } from 'vitest'

import { setActiveCloudVoiceForTests } from '../activeVoice'
import { createDefaultTtsCloudConfig } from '../configStore'
import { speakCloudTts } from '../speak'

describe('speakCloudTts', () => {
  it('rejects when backend is still local', async () => {
    const config = createDefaultTtsCloudConfig()
    config.ttsBackend = 'local'
    setActiveCloudVoiceForTests(config, { voiceId: 'v' })
    config.qwen.apiKey = 'k'

    let called = false
    const result = await speakCloudTts({
      text: '你好',
      readConfig: () => config,
      fetchImpl: async () => {
        called = true
        return new Response('')
      }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toContain('本地')
    expect(called).toBe(false)
  })

  it('downloads audio url from DashScope response', async () => {
    const config = createDefaultTtsCloudConfig()
    config.ttsBackend = 'qwen'
    setActiveCloudVoiceForTests(config, { voiceId: 'voice-x' })
    config.qwen.apiKey = 'k'

    const audioBytes = new Uint8Array([1, 2, 3, 4])
    let calls = 0
    const result = await speakCloudTts({
      text: '你好',
      readConfig: () => config,
      fetchImpl: async (url) => {
        calls += 1
        if (String(url).includes('multimodal-generation')) {
          return new Response(
            JSON.stringify({
              output: {
                audio: {
                  data: '',
                  url: 'https://cdn.example/audio.wav'
                }
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }
        return new Response(audioBytes, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' }
        })
      }
    })

    expect(calls).toBe(2)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Array.from(new Uint8Array(result.audio))).toEqual([1, 2, 3, 4])
      expect(result.mime).toBe('audio/wav')
    }
  })
})
