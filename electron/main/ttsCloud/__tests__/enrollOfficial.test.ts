import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import type { ApiKeyCrypto } from '../../chat/apiKeyAtRest'
import { createTtsCloudConfigStore } from '../configStore'
import { enrollOfficialSampleCloud } from '../enrollOfficial'
import { encodeMonoPcm16Wav } from '../prepareOfficialSample'

function fakeCrypto(map: Map<string, string> = new Map()): ApiKeyCrypto {
  let n = 0
  return {
    isAvailable: () => true,
    encrypt: (plain: string) => {
      const token = `enc-${++n}-${plain}`
      map.set(token, plain)
      return token
    },
    decrypt: (encB64: string) => map.get(encB64) ?? null
  }
}

describe('enrollOfficialSampleCloud', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('requires api key', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-enroll-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    const result = await enrollOfficialSampleCloud({
      store,
      prepareSample: () => ({ ok: false, detail: 'should not run' })
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toContain('API Key')
  })

  it('posts enrollment and persists voice id', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-enroll-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({ qwen: { apiKey: 'sk-test' } })
    const pcm = new Int16Array(24000 * 4)
    const wav = encodeMonoPcm16Wav(pcm, 24000)

    let seenBody: Record<string, unknown> | null = null
    const result = await enrollOfficialSampleCloud({
      store,
      prepareSample: () => ({
        ok: true,
        wavBytes: wav,
        mime: 'audio/wav',
        referenceText: '你好雪澜',
        durationSec: 4,
        sampleRate: 24000
      }),
      fetchImpl: async (_url, init) => {
        seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(JSON.stringify({ output: { voice: 'qwen-voice-xyz' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.voiceId).toBe('qwen-voice-xyz')
      expect(result.config.qwen.voiceId).toBe('qwen-voice-xyz')
      expect(result.config.qwen.activeKind).toBe('vc')
    }
    expect(seenBody?.model).toBe('qwen-voice-enrollment')
    const input = seenBody?.input as Record<string, unknown>
    expect(input.action).toBe('create')
    expect(input.target_model).toBe('qwen3-tts-vc-2026-01-22')
    expect(input.text).toBe('你好雪澜')
  })

  it('maps network error without AbortSignal (no aborted crash)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-enroll-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({ qwen: { apiKey: 'sk-test' } })
    const pcm = new Int16Array(24000 * 4)
    const wav = encodeMonoPcm16Wav(pcm, 24000)

    const result = await enrollOfficialSampleCloud({
      store,
      prepareSample: () => ({
        ok: true,
        wavBytes: wav,
        mime: 'audio/wav',
        referenceText: '你好',
        durationSec: 4,
        sampleRate: 24000
      }),
      fetchImpl: async () => {
        throw new Error('fetch failed')
      }
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.detail).toContain('云克隆失败')
      expect(result.detail).not.toMatch(/Cannot read properties/)
    }
  })
})
