import { describe, expect, it } from 'vitest'

import { setActiveCloudVoiceForTests } from '../activeVoice'
import { createDefaultTtsCloudConfig } from '../configStore'
import { synthesizeQwenTtsHttp } from '../qwenTtsClient'
import { createSynthesizeLock } from '../synthesizeLock'
import { previewCloudTts } from '../preview'

describe('ttsCloud synthesizer (C3)', () => {
  it('uses base64 audio data when present', async () => {
    const config = createDefaultTtsCloudConfig()
    setActiveCloudVoiceForTests(config, { voiceId: 'v' })
    config.qwen.apiKey = 'k'
    const b64 = Buffer.from([9, 8, 7]).toString('base64')

    const result = await synthesizeQwenTtsHttp({
      config,
      text: '你好',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output: { audio: { data: b64, url: '' } }
          }),
          { status: 200 }
        )
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Array.from(new Uint8Array(result.audio))).toEqual([9, 8, 7])
    }
  })

  it('picks vdModel when active voice kind is vd', async () => {
    const config = createDefaultTtsCloudConfig()
    config.qwen.vdModel = 'qwen3-tts-vd-2026-01-26'
    config.qwen.vcModel = 'qwen3-tts-vc-2026-01-22'
    setActiveCloudVoiceForTests(config, { voiceId: 'vd-voice', kind: 'vd' })
    config.qwen.apiKey = 'k'

    let seenModel = ''
    await synthesizeQwenTtsHttp({
      config,
      text: '你好',
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { model?: string }
        seenModel = body.model ?? ''
        return new Response(
          JSON.stringify({
            output: { audio: { data: Buffer.from([1]).toString('base64'), url: '' } }
          }),
          { status: 200 }
        )
      }
    })

    expect(seenModel).toBe('qwen3-tts-vd-2026-01-26')
  })

  it('lock runs requests serially', async () => {
    const lock = createSynthesizeLock()
    const order: number[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r
    })

    const p1 = lock.runExclusive(async () => {
      order.push(1)
      await firstGate
      order.push(2)
      return 'a'
    })
    const p2 = lock.runExclusive(async () => {
      order.push(3)
      return 'b'
    })

    await Promise.resolve()
    expect(order).toEqual([1])
    releaseFirst()
    await expect(Promise.all([p1, p2])).resolves.toEqual(['a', 'b'])
    expect(order).toEqual([1, 2, 3])
  })

  it('preview refuses empty credentials without calling fetch', async () => {
    let called = false
    const result = await previewCloudTts({
      text: '试听',
      readConfig: () => createDefaultTtsCloudConfig(),
      fetchImpl: async () => {
        called = true
        return new Response('')
      }
    })
    expect(result.ok).toBe(false)
    expect(called).toBe(false)
  })
})
