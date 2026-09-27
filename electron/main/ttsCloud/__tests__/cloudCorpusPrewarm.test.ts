import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import type { ApiKeyCrypto } from '../../chat/apiKeyAtRest'
import { getTtsCloudVoiceWavPath } from '../cloudCachePaths'
import {
  buildCloudManifestSkeleton,
  listLinesNeedingCloudPrewarm,
  resolveCloudCacheWav,
  writeCloudCacheManifest,
  writeCloudCacheWav
} from '../cloudCorpusCache'
import { cloudTextKey } from '../cloudCorpusHash'
import { prewarmCloudCorpus } from '../cloudCorpusPrewarm'
import { createTtsCloudConfigStore } from '../configStore'

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

describe('cloud corpus cache / prewarm', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('text key is stable 16-hex', () => {
    expect(cloudTextKey('  你好  ')).toBe(cloudTextKey('你好'))
    expect(cloudTextKey('你好')).toMatch(/^[a-f0-9]{16}$/)
  })

  it('prewarm writes one wav per line and resolve hits', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-cloud-prewarm-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({
      qwen: {
        apiKey: 'sk-test',
        voiceId: 'voice-a'
      }
    })
    // ensure localId from migrated official voice
    const localId = store.getView().qwen.activeVoiceLocalId
    expect(localId).toBeTruthy()

    const result = await prewarmCloudCorpus({
      store,
      userDataPath: dir,
      applyTouchMode: false,
      localId,
      corpus: {
        head: ['第一句'],
        arms: [],
        body: ['第二句'],
        legs: [],
        tail: []
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output: { audio: { data: Buffer.from([1, 2, 3, 4]).toString('base64'), url: '' } }
          }),
          { status: 200 }
        )
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.total).toBe(2)
    expect(result.synthesized).toBe(2)
    expect(result.failed).toBe(0)

    const hit = resolveCloudCacheWav(dir, localId, '第一句')
    expect(hit.ok).toBe(true)
    if (hit.ok) {
      expect(Array.from(hit.bytes)).toEqual([1, 2, 3, 4])
    }

    const miss = resolveCloudCacheWav(dir, localId, '不存在')
    expect(miss.ok).toBe(false)
  })

  it('skips lines that already have wav when source unchanged', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-cloud-skip-'))
    const corpus = {
      head: ['已有'],
      arms: [],
      body: [],
      legs: [],
      tail: []
    }
    const { manifest, lines } = buildCloudManifestSkeleton({
      localVoiceId: 'v1',
      bailianVoiceId: 'b1',
      kind: 'vc',
      model: 'qwen3-tts-vc-2026-01-22',
      corpus
    })
    const key = manifest.entries['已有']!.key
    writeCloudCacheWav(dir, 'v1', key, new Uint8Array([9]).buffer)
    writeCloudCacheManifest(dir, 'v1', manifest)

    const need = listLinesNeedingCloudPrewarm(dir, 'v1', manifest, lines)
    expect(need).toEqual([])
    expect(existsSync(getTtsCloudVoiceWavPath(dir, 'v1', key))).toBe(true)
  })
})
