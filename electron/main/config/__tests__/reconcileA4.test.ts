import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A4：保持 alt 时清掉卡住的 prewarming session。 */

const runtimeRoot = mkdtempSync(join(tmpdir(), 'xue-a4-reconcile-'))

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

describe('reconcile A4 alt keeps mode but clears stuck session', () => {
  beforeEach(() => {
    mkdirSync(runtimeRoot, { recursive: true })
    writeFileSync(
      join(runtimeRoot, 'default-corpus.json'),
      JSON.stringify({ head: [], arms: [], body: ['hi'], legs: [], tail: [] }),
      'utf8'
    )
    writeFileSync(
      join(runtimeRoot, 'corpus.custom.json'),
      JSON.stringify({ head: [], arms: [], body: ['alt'], legs: [], tail: [] }),
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
    writeFileSync(
      join(runtimeRoot, 'voice-forge-session.json'),
      JSON.stringify({ flow: 'create_voice', phase: 'prewarming', version: 1 }),
      'utf8'
    )
  })

  afterEach(() => {
    rmSync(runtimeRoot, { recursive: true, force: true })
    mkdirSync(runtimeRoot, { recursive: true })
  })

  it('保持 alt_engine_corpus 且清掉 prewarming session', async () => {
    const { reconcileVoiceRuntimeConfig } = await import('../reconcile')
    const { readTouchConfig } = await import('../domains/touch')
    const sessionPath = join(runtimeRoot, 'voice-forge-session.json')

    expect(existsSync(sessionPath)).toBe(true)
    expect(reconcileVoiceRuntimeConfig()).toBe('alt_engine_corpus')
    expect(readTouchConfig().mode).toBe('alt_engine_corpus')
    expect(existsSync(sessionPath)).toBe(false)
  })
})
