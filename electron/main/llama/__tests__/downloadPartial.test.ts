import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'

import {
  DownloadAbortError,
  cleanupModelDownloadPartials,
  downloadPartialPath,
  isDownloadAbortError,
  isIncompleteDownloadFile,
  listGgufModelFiles,
  removeDownloadArtifacts,
  sweepIncompleteModelArtifacts,
  writeExpectedDownloadSize
} from '../download'

describe('download partial artifacts', () => {
  const dir = join(tmpdir(), `xue-llama-dl-test-${Date.now()}`)

  afterEach(() => {
    cleanupModelDownloadPartials(dir, [])
    try {
      for (const name of [
        'a.gguf',
        'a.gguf.partial',
        'a.gguf.expected',
        'ok.gguf',
        'ok.gguf.partial',
        'orphan.gguf.partial',
        'good.gguf',
        'bad.gguf',
        'x.gguf.partial',
        'y.expected'
      ]) {
        const p = join(dir, name)
        if (existsSync(p)) unlinkSync(p)
      }
    } catch {
      // ignore
    }
  })

  it('downloadPartialPath appends .partial', () => {
    expect(downloadPartialPath('C:/models/x.gguf')).toBe('C:/models/x.gguf.partial')
  })

  it('listGgufModelFiles ignores non-gguf and does not treat .partial as model', () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'ok.gguf'), 'x')
    writeFileSync(join(dir, 'ok.gguf.partial'), 'y')
    expect(listGgufModelFiles(dir)).toEqual(['ok.gguf'])
  })

  it('removeDownloadArtifacts deletes dest and .partial', () => {
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, 'a.gguf')
    writeFileSync(dest, 'partial-as-final')
    writeFileSync(downloadPartialPath(dest), 'partial')
    removeDownloadArtifacts(dest)
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(downloadPartialPath(dest))).toBe(false)
  })

  it('cleanupModelDownloadPartials clears *.partial and listed dests', () => {
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, 'a.gguf')
    writeFileSync(dest, 'broken')
    writeFileSync(join(dir, 'orphan.gguf.partial'), 'x')
    cleanupModelDownloadPartials(dir, [dest])
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(join(dir, 'orphan.gguf.partial'))).toBe(false)
  })

  it('isDownloadAbortError detects abort errors', () => {
    expect(isDownloadAbortError(new DownloadAbortError())).toBe(true)
    expect(isDownloadAbortError(new Error('other'))).toBe(false)
  })

  it('isIncompleteDownloadFile uses .expected sidecar', () => {
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, 'a.gguf')
    writeFileSync(dest, 'x')
    writeExpectedDownloadSize(dest, 1000)
    expect(isIncompleteDownloadFile(dest, 100)).toBe(true)
    expect(isIncompleteDownloadFile(dest, 1000)).toBe(false)
    removeDownloadArtifacts(dest)
  })

  it('sweepIncompleteModelArtifacts keeps complete gguf, removes partial/expected/too-small', () => {
    mkdirSync(dir, { recursive: true })
    const good = join(dir, 'good.gguf')
    const bad = join(dir, 'bad.gguf')
    writeFileSync(good, Buffer.alloc(200))
    writeFileSync(bad, 'tiny')
    writeFileSync(join(dir, 'x.gguf.partial'), 'p')
    writeFileSync(join(dir, 'y.expected'), '1')
    const removed = sweepIncompleteModelArtifacts(dir, { minUsableBytes: 50 })
    expect(removed).toEqual(expect.arrayContaining(['x.gguf.partial', 'y.expected', 'bad.gguf']))
    expect(existsSync(good)).toBe(true)
    expect(existsSync(bad)).toBe(false)
  })
})
