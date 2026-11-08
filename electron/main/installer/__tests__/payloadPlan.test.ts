import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { missingAppRootFiles, shouldShipAppRootFile } from '../../../../scripts/installer/payloadPlan.mjs'
import { listAppRootRelPaths } from '../../../../scripts/installer/payloadPlan.mjs'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('shouldShipAppRootFile', () => {
  it('keeps the voice server and the official reference, and drops local weights', () => {
    expect(shouldShipAppRootFile('tts_voice/tts_server.py')).toBe(true)
    expect(shouldShipAppRootFile('src/data/corpus.json')).toBe(true)
    expect(shouldShipAppRootFile('voice_forge/default_sample/reference.wav')).toBe(true)
    expect(shouldShipAppRootFile('scripts/qwen3-tts/download-model.cmd')).toBe(true)
    expect(shouldShipAppRootFile('tts_voice/bert/G_900.pth')).toBe(false)
    expect(shouldShipAppRootFile('tts_voice/tests/test_reconcile.py')).toBe(false)
    expect(shouldShipAppRootFile('tts_voice/config.json')).toBe(false)
    expect(shouldShipAppRootFile('public/models/hiyori_pro/runtime/a.model3.json')).toBe(false)
    expect(shouldShipAppRootFile('.venv/Scripts/python.exe')).toBe(false)
    expect(shouldShipAppRootFile('scripts/win/tests/test_stt_model_root.py')).toBe(false)
    expect(shouldShipAppRootFile('voice_forge/default_sample/corpus.snapshot.json')).toBe(false)
    expect(shouldShipAppRootFile('voice_forge/default_sample/touch_cache/a.wav')).toBe(false)
  })
})

describe('listAppRootRelPaths', () => {
  it('copies only the allowlist out of a fixture tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'xue-payload-'))
    temps.push(root)
    const files = [
      'tts_voice/tts_server.py',
      'tts_voice/bert/G_900.pth',
      'tts_voice/tests/test_reconcile.py',
      'src/data/corpus.json',
      'voice_forge/default_sample/reference.wav',
      'voice_forge/default_sample/corpus.snapshot.json',
      'public/models/hiyori_pro/a.bin',
      '.venv/Scripts/python.exe',
      'scripts/qwen3-tts/download-model.cmd',
      'scripts/win/install-tts-deps.cmd'
    ]
    for (const rel of files) {
      const abs = join(root, rel)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, 'x', 'utf8')
    }

    const shipped = listAppRootRelPaths(root)
    expect(shipped).toEqual([
      'scripts/qwen3-tts/download-model.cmd',
      'scripts/win/install-tts-deps.cmd',
      'src/data/corpus.json',
      'tts_voice/tts_server.py',
      'voice_forge/default_sample/reference.wav'
    ])
    expect(missingAppRootFiles(shipped).length).toBeGreaterThan(0)
  })

  it('finds every required file in this repository', () => {
    const repo = process.cwd()
    expect(missingAppRootFiles(listAppRootRelPaths(repo))).toEqual([])
  })
})
