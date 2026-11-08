import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultTtsCloudConfig } from '../configStore'
import {
  getCloudTtsProvider,
  listCloudTtsProviders,
  resolveCloudTtsProvider
} from '../provider'
import '../providers/qwenProvider'
import '../providers/seedProvider'
import '../providers/edgeProvider'
import { setActiveCloudVoiceForTests } from '../activeVoice'

describe('cloud tts provider', () => {
  beforeEach(() => {
    expect(getCloudTtsProvider('qwen')?.id).toBe('qwen')
  })

  it('lists the qwen adapter and its capabilities', () => {
    const qwen = listCloudTtsProviders().find((provider) => provider.id === 'qwen')
    expect(qwen?.label).toBe('阿里云')
    expect(qwen?.capabilities).toEqual({ clone: true, design: true })
  })

  it('resolve follows ttsBackend and does not invent a provider for local', () => {
    const local = createDefaultTtsCloudConfig()
    expect(resolveCloudTtsProvider(local)).toBeNull()

    const cloud = createDefaultTtsCloudConfig()
    cloud.ttsBackend = 'qwen'
    expect(resolveCloudTtsProvider(cloud)?.id).toBe('qwen')

    const seed = createDefaultTtsCloudConfig()
    seed.ttsBackend = 'seed'
    expect(resolveCloudTtsProvider(seed)?.id).toBe('seed')
    const edge = createDefaultTtsCloudConfig()
    edge.ttsBackend = 'edge'
    expect(resolveCloudTtsProvider(edge)?.id).toBe('edge')
  })

  it('qwen synthesize delegates to the existing http client', async () => {
    const config = createDefaultTtsCloudConfig()
    config.ttsBackend = 'qwen'
    setActiveCloudVoiceForTests(config, { voiceId: 'voice-x' })
    config.qwen.apiKey = 'k'

    const result = await getCloudTtsProvider('qwen')!.synthesize({
      config,
      text: '你好',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output: { audio: { data: Buffer.from([1, 2]).toString('base64'), url: '' } }
          }),
          { status: 200 }
        )
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Array.from(new Uint8Array(result.audio))).toEqual([1, 2])
    }
  })
})
