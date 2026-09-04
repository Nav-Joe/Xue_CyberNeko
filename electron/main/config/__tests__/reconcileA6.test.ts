import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A6：curated + 官方 + !useCurated 时，须 touch_cache ready 才升 custom_corpus。
 * 与 Python test_curated_without/with_touch_cache_* 对称。
 */

const runtimeRoot = mkdtempSync(join(tmpdir(), 'xue-a6-reconcile-'))
const forgeRoot = mkdtempSync(join(tmpdir(), 'xue-a6-forge-'))

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

function writeBaseCuratedOfficial(useCuratedClips: boolean): void {
  mkdirSync(runtimeRoot, { recursive: true })
  mkdirSync(join(forgeRoot, 'default_sample'), { recursive: true })
  writeFileSync(
    join(runtimeRoot, 'default-corpus.json'),
    JSON.stringify({ head: [], arms: [], body: ['hi'], legs: [], tail: [] }),
    'utf8'
  )
  writeFileSync(join(runtimeRoot, 'touch-mode.env'), 'curated\n', 'utf8')
  writeFileSync(
    join(runtimeRoot, 'voice-forge.json'),
    JSON.stringify({
      activeSample: { folderId: 'default_sample', kind: 'official', pending: false },
      officialUseCuratedClips: useCuratedClips
    }),
    'utf8'
  )
}

describe('reconcile A6 curated→custom 须 touch_cache ready', () => {
  beforeEach(() => {
    writeBaseCuratedOfficial(false)
  })

  afterEach(() => {
    rmSync(runtimeRoot, { recursive: true, force: true })
    rmSync(forgeRoot, { recursive: true, force: true })
    mkdirSync(runtimeRoot, { recursive: true })
    mkdirSync(forgeRoot, { recursive: true })
  })

  it('无 touch_cache 时保持 curated', async () => {
    const { reconcileVoiceRuntimeConfig } = await import('../reconcile')
    const { readTouchConfig } = await import('../domains/touch')

    expect(reconcileVoiceRuntimeConfig()).toBe('curated')
    expect(readTouchConfig().mode).toBe('curated')
  })

  it('pointer ready=true 时升到 custom_corpus', async () => {
    writeFileSync(
      join(forgeRoot, 'default_sample', 'touch_cache.json'),
      JSON.stringify({ ready: true }) + '\n',
      'utf8'
    )

    const { reconcileVoiceRuntimeConfig } = await import('../reconcile')
    const { readTouchConfig } = await import('../domains/touch')

    expect(reconcileVoiceRuntimeConfig()).toBe('custom_corpus')
    expect(readTouchConfig().mode).toBe('custom_corpus')
  })
})
