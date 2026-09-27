import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import type { ApiKeyCrypto } from '../../chat/apiKeyAtRest'
import {
  approveCloudPendingCreate,
  getCloudPendingReviewStatus,
  rejectCloudPendingCreate
} from '../cloudCreateReview'
import { designCloudVoice } from '../cloudVoiceOps'
import { createTtsCloudConfigStore } from '../configStore'
import { readCloudPendingCreate } from '../pendingCloudCreate'
import type { CorpusData } from '../../../../src/types/corpus'

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

const corpus: CorpusData = {
  head: ['摸摸头'],
  arms: [],
  body: [],
  legs: [],
  tail: []
}

describe('cloud create staging / review', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('stageOnly design does not write voices until approve', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-cloud-stage-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({ qwen: { apiKey: 'sk-test' } })
    const preview = Buffer.from([9, 8, 7]).toString('base64')

    const staged = await designCloudVoice({
      store,
      displayName: '云端雪',
      voicePrompt: '温柔女声',
      stageOnly: true,
      corpus,
      userDataPath: dir,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output: {
              voice: 'vd-pending-1',
              preview_audio: { data: preview, response_format: 'wav' }
            }
          }),
          { status: 200 }
        )
    })

    expect(staged.ok).toBe(true)
    expect(store.getView().qwen.voices).toHaveLength(0)
    expect(readCloudPendingCreate(dir)?.voiceId).toBe('vd-pending-1')
    expect(getCloudPendingReviewStatus(dir)?.backend).toBe('cloud')

    const approved = approveCloudPendingCreate({ userDataPath: dir, store })
    expect(approved.ok).toBe(true)
    if (approved.ok) {
      expect(approved.voiceId).toBe('vd-pending-1')
      expect(approved.corpus.head).toEqual(['摸摸头'])
      expect(approved.config.qwen.voices).toHaveLength(1)
      expect(approved.config.qwen.activeVoiceLocalId).toBe(approved.localId)
    }
    expect(readCloudPendingCreate(dir)).toBeNull()
  })

  it('reject regenerate clears pending and best-effort deletes remote', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-cloud-reject-'))
    const store = createTtsCloudConfigStore({
      getUserDataPath: () => dir,
      crypto: fakeCrypto()
    })
    store.writePatch({ qwen: { apiKey: 'sk-test' } })

    await designCloudVoice({
      store,
      displayName: '临时',
      voicePrompt: '描述',
      stageOnly: true,
      corpus,
      userDataPath: dir,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output: { voice: 'vd-tmp', preview_audio: { data: '', response_format: 'wav' } }
          }),
          { status: 200 }
        )
    })

    const deleteCalls: unknown[] = []
    const rejected = await rejectCloudPendingCreate({
      userDataPath: dir,
      action: 'regenerate',
      store,
      awaitRemoteDelete: true,
      fetchImpl: async (_url, init) => {
        deleteCalls.push(JSON.parse(String(init?.body)))
        return new Response('{}', { status: 200 })
      }
    })

    expect(rejected.ok).toBe(true)
    if (rejected.ok) {
      expect(rejected.action).toBe('regenerate')
      expect(rejected.pending?.voiceId).toBe('vd-tmp')
    }
    expect(readCloudPendingCreate(dir)).toBeNull()
    expect(deleteCalls.length).toBeGreaterThan(0)
    expect((deleteCalls[0] as { input?: { action?: string; voice?: string } }).input?.action).toBe(
      'delete'
    )
    expect((deleteCalls[0] as { input?: { voice?: string } }).input?.voice).toBe('vd-tmp')
  })
})
