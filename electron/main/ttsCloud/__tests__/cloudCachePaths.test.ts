import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  assertSafeCloudLocalVoiceId,
  getTtsCloudCacheRoot,
  getTtsCloudVoiceCacheDir,
  isSafeCloudLocalVoiceId
} from '../cloudCachePaths'
import { removeCloudVoiceCacheDir } from '../cloudCorpusCache'
import type { ApiKeyCrypto } from '../../chat/apiKeyAtRest'
import { createTtsCloudConfigStore } from '../configStore'

function fakeCrypto(): ApiKeyCrypto {
  return {
    isAvailable: () => false,
    encrypt: () => {
      throw new Error('unavailable')
    },
    decrypt: () => null
  }
}

describe('cloudCachePaths localId hardening', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('rejects traversal and empty ids', () => {
    expect(isSafeCloudLocalVoiceId('..')).toBe(false)
    expect(isSafeCloudLocalVoiceId('../')).toBe(false)
    expect(isSafeCloudLocalVoiceId('a/b')).toBe(false)
    expect(isSafeCloudLocalVoiceId('a\\b')).toBe(false)
    expect(isSafeCloudLocalVoiceId('')).toBe(false)
    expect(isSafeCloudLocalVoiceId('_leading')).toBe(false)
    expect(() => assertSafeCloudLocalVoiceId('..')).toThrow('非法音色 id')
  })

  it('accepts generated-style ids', () => {
    expect(isSafeCloudLocalVoiceId('vd-m1abc-1')).toBe(true)
    expect(isSafeCloudLocalVoiceId('vc-migrated-xyz')).toBe(true)
    expect(isSafeCloudLocalVoiceId('vc-123')).toBe(true)
  })

  it('getTtsCloudVoiceCacheDir throws on unsafe id', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-cloud-cache-'))
    expect(() => getTtsCloudVoiceCacheDir(dir, '..')).toThrow('非法音色 id')
    expect(() => getTtsCloudVoiceCacheDir(dir, 'a/b')).toThrow('非法音色 id')
    expect(() => getTtsCloudVoiceCacheDir(dir, '')).toThrow('非法音色 id')
  })

  it('removeCloudVoiceCacheDir with ".." must not wipe userData', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-cloud-cache-'))
    const sentinel = join(dir, 'sentinel.txt')
    writeFileSync(sentinel, 'keep-me', 'utf-8')
    mkdirSync(getTtsCloudCacheRoot(dir), { recursive: true })

    expect(() => removeCloudVoiceCacheDir(dir, '..')).toThrow('非法音色 id')
    expect(existsSync(sentinel)).toBe(true)
    expect(readFileSync(sentinel, 'utf-8')).toBe('keep-me')
  })

  it('safe id still resolves under tts-cloud-cache', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-cloud-cache-'))
    const voiceDir = getTtsCloudVoiceCacheDir(dir, 'vd-m1abc-1')
    expect(voiceDir).toBe(join(getTtsCloudCacheRoot(dir), 'vd-m1abc-1'))
    mkdirSync(voiceDir, { recursive: true })
    expect(existsSync(voiceDir)).toBe(true)
    removeCloudVoiceCacheDir(dir, 'vd-m1abc-1')
    expect(existsSync(voiceDir)).toBe(false)
  })

  it('normalizeVoices drops dirty ids on writePatch', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-cloud-cfg-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({
      qwen: {
        voices: [
          {
            id: '..',
            kind: 'vd',
            name: 'bad',
            voiceId: 'bailian-1',
            createdAt: 1
          },
          {
            id: 'vd-good-1',
            kind: 'vd',
            name: 'good',
            voiceId: 'bailian-2',
            createdAt: 2
          },
          {
            id: 'a/b',
            kind: 'vc',
            name: 'slash',
            voiceId: 'bailian-3',
            createdAt: 3
          }
        ]
      }
    })
    const voices = store.read().qwen.voices
    expect(voices).toHaveLength(1)
    expect(voices[0]?.id).toBe('vd-good-1')
  })
})
