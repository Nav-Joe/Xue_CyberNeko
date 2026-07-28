import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A1 护栏：alt + 缺 corpus.custom.json → curated（与 Python 统一）。
 * 通过 mock runtime 路径，真实跑 reconcileVoiceRuntimeConfig。
 */

const runtimeRoot = mkdtempSync(join(tmpdir(), 'xue-a1-reconcile-'))

vi.mock('../paths', async () => {
  const actual = await vi.importActual<typeof import('../paths')>('../paths')
  return {
    ...actual,
    runtimeDir: () => runtimeRoot,
    touchModeFile: () => join(runtimeRoot, 'touch-mode.env'),
    customCorpusFile: () => join(runtimeRoot, 'corpus.custom.json'),
    voiceForgeFile: () => join(runtimeRoot, 'voice-forge.json'),
    voiceForgeSessionFile: () => join(runtimeRoot, 'voice-forge-session.json'),
    defaultCorpusFile: () => join(runtimeRoot, 'default-corpus.json'),
    defaultSampleDir: () => join(runtimeRoot, 'default_sample')
  }
})

vi.mock('../../ttsEngineInfo', () => ({
  readConfiguredTtsEngine: () => 'bert_vits2'
}))

describe('reconcile A1 alt missing corpus', () => {
  beforeEach(() => {
    mkdirSync(runtimeRoot, { recursive: true })
    writeFileSync(
      join(runtimeRoot, 'default-corpus.json'),
      JSON.stringify({ head: [], arms: [], body: ['hi'], legs: [], tail: [] }),
      'utf8'
    )
    writeFileSync(join(runtimeRoot, 'touch-mode.env'), 'alt_engine_corpus\n', 'utf8')
    writeFileSync(
      join(runtimeRoot, 'voice-forge.json'),
      JSON.stringify({
        activeSample: { folderId: 'default_sample', kind: 'official', pending: false },
        officialUseCuratedClips: true
      }),
      'utf8'
    )
  })

  afterEach(() => {
    rmSync(runtimeRoot, { recursive: true, force: true })
    mkdirSync(runtimeRoot, { recursive: true })
  })

  it('缺 corpus.custom.json 时退回 curated', async () => {
    const { reconcileVoiceRuntimeConfig } = await import('../reconcile')
    const { readTouchConfig } = await import('../domains/touch')

    expect(reconcileVoiceRuntimeConfig()).toBe('curated')
    expect(readTouchConfig().mode).toBe('curated')
  })

  it('有 corpus.custom.json 时保持 alt_engine_corpus', async () => {
    writeFileSync(
      join(runtimeRoot, 'corpus.custom.json'),
      JSON.stringify({ head: [], arms: [], body: ['alt'], legs: [], tail: [] }),
      'utf8'
    )
    const { reconcileVoiceRuntimeConfig } = await import('../reconcile')
    const { readTouchConfig } = await import('../domains/touch')

    expect(reconcileVoiceRuntimeConfig()).toBe('alt_engine_corpus')
    expect(readTouchConfig().mode).toBe('alt_engine_corpus')
  })
})
