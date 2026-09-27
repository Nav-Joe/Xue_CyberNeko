import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import type { ApiKeyCrypto } from '../../chat/apiKeyAtRest'
import { designCloudVoice, enrollCustomSampleCloud } from '../cloudVoiceOps'
import { createTtsCloudConfigStore } from '../configStore'
import { encodeMonoPcm16Wav } from '../prepareOfficialSample'
import { removeCloudVoice } from '../removeCloudVoice'

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

describe('cloud voice ops phase 2', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('designCloudVoice persists vd voice and returns preview audio', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-vd-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({ qwen: { apiKey: 'sk-test' } })
    const preview = Buffer.from([1, 2, 3]).toString('base64')

    let seenModel = ''
    const result = await designCloudVoice({
      store,
      displayName: '软软少女',
      voicePrompt: '中文少女，轻声细语',
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          model?: string
          input?: { target_model?: string }
        }
        seenModel = body.model ?? ''
        expect(body.input?.target_model).toBe('qwen3-tts-vd-2026-01-26')
        return new Response(
          JSON.stringify({
            output: {
              voice: 'vd-voice-1',
              preview_audio: { data: preview, response_format: 'wav' }
            }
          }),
          { status: 200 }
        )
      }
    })

    expect(seenModel).toBe('qwen-voice-design')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.voiceId).toBe('vd-voice-1')
      expect(result.config.qwen.activeKind).toBe('vd')
      expect(result.config.qwen.voices).toHaveLength(1)
      expect(result.previewAudio).toBeTruthy()
      expect(Array.from(new Uint8Array(result.previewAudio!))).toEqual([1, 2, 3])
    }
  })

  it('enrollCustomSampleCloud appends vc voice', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-custom-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({ qwen: { apiKey: 'sk-test' } })
    const wav = encodeMonoPcm16Wav(new Int16Array(24000 * 4), 24000)

    const result = await enrollCustomSampleCloud({
      store,
      filePath: 'dummy.wav',
      displayName: '我的克隆',
      referenceText: '测试台词',
      readFile: () => wav,
      fetchImpl: async () =>
        new Response(JSON.stringify({ output: { voice: 'custom-voice' } }), { status: 200 })
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.voiceId).toBe('custom-voice')
      expect(result.config.qwen.activeKind).toBe('vc')
      expect(result.config.qwen.voices[0]?.name).toBe('我的克隆')
    }
  })

  it('removeCloudVoice drops local entry even if remote delete fails', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-rm-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({
      qwen: {
        apiKey: 'sk-test',
        voiceId: 'to-delete'
      }
    })
    const localId = store.getView().qwen.activeVoiceLocalId
    expect(localId).toBeTruthy()

    const result = await removeCloudVoice({
      store,
      localId,
      fetchImpl: async () => new Response('fail', { status: 500 })
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.remoteDeleted).toBe(false)
      expect(result.config.qwen.voices).toEqual([])
    }
  })
})
