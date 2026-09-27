import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { localQwenModelsReady } from '../ttsEngineInfo'

describe('localQwenModelsReady', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('returns false when weights missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-qwen-miss-'))
    expect(localQwenModelsReady(dir)).toBe(false)
  })

  it('returns true when VoiceDesign + Base config exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'xue-qwen-ok-'))
    const vd = join(dir, 'Qwen3_TTS', 'models', 'Qwen3-TTS-12Hz-1.7B-VoiceDesign')
    const base = join(dir, 'Qwen3_TTS', 'models', 'Qwen3-TTS-12Hz-0.6B-Base')
    mkdirSync(vd, { recursive: true })
    mkdirSync(base, { recursive: true })
    writeFileSync(join(vd, 'config.json'), '{}\n', 'utf8')
    writeFileSync(join(base, 'config.json'), '{}\n', 'utf8')
    expect(localQwenModelsReady(dir)).toBe(true)
  })
})
