import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import type { ApiKeyCrypto } from '../../chat/apiKeyAtRest'
import { resolveActiveQwenVoice } from '../activeVoice'
import { createTtsCloudConfigStore } from '../configStore'
import { getTtsCloudCacheRoot } from '../cloudCachePaths'

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

describe('ttsCloud configStore', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('defaults to local backend, dual models, empty voices', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-tts-cloud-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    const view = store.getView()
    expect(view.ttsBackend).toBe('local')
    expect(view.qwen.vcModel).toBe('qwen3-tts-vc-2026-01-22')
    expect(view.qwen.vdModel).toBe('qwen3-tts-vd-2026-01-26')
    expect(view.qwen.voices).toEqual([])
    expect(view.qwen.voiceId).toBe('')
    expect(view.qwen.model).toBe('qwen3-tts-vc-2026-01-22')
    expect(view.qwen.hasApiKey).toBe(false)
    expect(view.qwen.baseUrl).toContain('dashscope')
  })

  it('persists encrypted key and hides plaintext when secretSave', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-tts-cloud-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({
      ttsBackend: 'qwen',
      qwen: {
        vcModel: 'qwen3-tts-vc-2026-01-22',
        voiceId: 'voice-x',
        apiKey: 'sk-secret',
        secretSave: true
      }
    })
    const view = store.getView()
    expect(view.ttsBackend).toBe('qwen')
    expect(view.qwen.hasApiKey).toBe(true)
    expect(view.qwen.apiKey).toBeUndefined()
    expect(view.qwen.voiceId).toBe('voice-x')
    expect(view.qwen.activeKind).toBe('vc')
    expect(store.read().qwen.apiKey).toBe('sk-secret')

    const disk = JSON.parse(readFileSync(join(dir, 'tts-cloud-config.json'), 'utf-8')) as {
      qwen: {
        apiKey?: string
        apiKeyEnc?: string
        vcModel?: string
        vdModel?: string
        voices?: unknown[]
        model?: string
        voiceId?: string
      }
      fish?: unknown
    }
    expect(disk.qwen.apiKey ?? '').toBe('')
    expect(disk.qwen.apiKeyEnc).toMatch(/^enc-/)
    expect(disk.qwen.vcModel).toBe('qwen3-tts-vc-2026-01-22')
    expect(disk.qwen.vdModel).toBe('qwen3-tts-vd-2026-01-26')
    expect(Array.isArray(disk.qwen.voices)).toBe(true)
    expect(disk.qwen.model).toBeUndefined()
    expect(disk.qwen.voiceId).toBeUndefined()
    expect(disk.fish).toBeUndefined()
  })

  it('migrates legacy single model+voiceId into vc voice list', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-tts-cloud-'))
    writeFileSync(
      join(dir, 'tts-cloud-config.json'),
      JSON.stringify({
        ttsBackend: 'qwen',
        qwen: {
          baseUrl: 'https://dashscope.aliyuncs.com',
          model: 'qwen3-tts-vc-2026-01-22',
          voiceId: 'legacy-voice',
          apiKey: 'sk-legacy',
          secretSave: false
        }
      }),
      'utf-8'
    )
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    const config = store.read()
    expect(config.ttsBackend).toBe('qwen')
    expect(config.qwen.vcModel).toBe('qwen3-tts-vc-2026-01-22')
    expect(config.qwen.vdModel).toBe('qwen3-tts-vd-2026-01-26')
    expect(config.qwen.voices).toHaveLength(1)
    expect(config.qwen.voices[0]?.voiceId).toBe('legacy-voice')
    expect(config.qwen.voices[0]?.kind).toBe('vc')
    const active = resolveActiveQwenVoice(config)
    expect(active?.voiceId).toBe('legacy-voice')
    expect(active?.model).toBe('qwen3-tts-vc-2026-01-22')

    const disk = JSON.parse(readFileSync(join(dir, 'tts-cloud-config.json'), 'utf-8')) as {
      qwen: { voices: unknown[]; model?: string; voiceId?: string }
    }
    expect(disk.qwen.voices).toHaveLength(1)
    expect(disk.qwen.model).toBeUndefined()
    expect(disk.qwen.voiceId).toBeUndefined()
  })

  it('legacy fish disk falls back to local and does not map fields', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-tts-cloud-'))
    writeFileSync(
      join(dir, 'tts-cloud-config.json'),
      JSON.stringify({
        ttsBackend: 'fish',
        fish: {
          baseUrl: 'https://api.fish.audio',
          model: 's2.1-pro-free',
          voiceId: 'old-voice',
          apiKey: 'sk-old',
          secretSave: false
        }
      }),
      'utf-8'
    )
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    const config = store.read()
    expect(config.ttsBackend).toBe('local')
    expect(config.qwen.voices).toEqual([])
    expect(config.qwen.apiKey).toBe('')
    expect(config.qwen.vcModel).toBe('qwen3-tts-vc-2026-01-22')

    const disk = JSON.parse(readFileSync(join(dir, 'tts-cloud-config.json'), 'utf-8')) as {
      ttsBackend: string
      qwen: { voices: unknown[] }
      fish?: unknown
    }
    expect(disk.ttsBackend).toBe('local')
    expect(disk.qwen.voices).toEqual([])
    expect(disk.fish).toBeUndefined()
  })

  it('cloud cache root stays under userData and separate from voice_forge', () => {
    expect(getTtsCloudCacheRoot('C:/data/user')).toMatch(/tts-cloud-cache$/)
    expect(getTtsCloudCacheRoot('C:/data/user')).not.toMatch(/voice_forge/)
  })
})
