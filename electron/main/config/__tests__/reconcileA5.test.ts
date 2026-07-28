import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A5：custom 仅有 wav、无 txt → Electron reconcile 退 curated。 */

const runtimeRoot = mkdtempSync(join(tmpdir(), 'xue-a5-reconcile-'))
const forgeRoot = mkdtempSync(join(tmpdir(), 'xue-a5-forge-'))

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
    defaultSampleDir: () => join(forgeRoot, 'default_sample'),
    sampleDirForId: (id: string) =>
      id === 'default_sample' ? join(forgeRoot, 'default_sample') : join(forgeRoot, 'custom_sample', id)
  }
})

vi.mock('../../ttsEngineInfo', () => ({
  readConfiguredTtsEngine: () => 'qwen'
}))

describe('reconcile A5 wav-only custom → curated', () => {
  beforeEach(() => {
    mkdirSync(runtimeRoot, { recursive: true })
    mkdirSync(join(forgeRoot, 'custom_sample', 'wav_only'), { recursive: true })
    mkdirSync(join(forgeRoot, 'default_sample'), { recursive: true })
    writeFileSync(
      join(runtimeRoot, 'default-corpus.json'),
      JSON.stringify({ head: [], arms: [], body: ['hi'], legs: [], tail: [] }),
      'utf8'
    )
    writeFileSync(join(forgeRoot, 'custom_sample', 'wav_only', 'reference.wav'), 'x')
    // 故意不写 reference.txt
    writeFileSync(join(runtimeRoot, 'touch-mode.env'), 'custom_corpus\n', 'utf8')
    writeFileSync(
      join(runtimeRoot, 'voice-forge.json'),
      JSON.stringify({
        activeSample: { folderId: 'wav_only', kind: 'custom', pending: false },
        officialUseCuratedClips: true
      }),
      'utf8'
    )
  })

  afterEach(() => {
    rmSync(runtimeRoot, { recursive: true, force: true })
    rmSync(forgeRoot, { recursive: true, force: true })
    mkdirSync(runtimeRoot, { recursive: true })
    mkdirSync(forgeRoot, { recursive: true })
  })

  it('仅 wav 的自定义声线在 reconcile 后退回 curated', async () => {
    const { reconcileVoiceRuntimeConfig } = await import('../reconcile')
    const { readTouchConfig } = await import('../domains/touch')

    expect(reconcileVoiceRuntimeConfig()).toBe('curated')
    expect(readTouchConfig().mode).toBe('curated')
  })
})
