import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sampleHasReference, sampleReadyForTts } from '../internal/sample-utils'

describe('sampleReadyForTts（A5 · 与 Python _active_sample_ready 对齐）', () => {
  const root = mkdtempSync(join(tmpdir(), 'xue-a5-sample-'))

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    mkdirSync(root, { recursive: true })
  })

  beforeEach(() => {
    mkdirSync(root, { recursive: true })
  })

  it('仅 wav：列表可见，reconcile 未就绪', () => {
    writeFileSync(join(root, 'reference.wav'), 'x')
    expect(sampleHasReference(root)).toBe(true)
    expect(sampleReadyForTts(root)).toBe(false)
  })

  it('wav+txt：两端就绪', () => {
    writeFileSync(join(root, 'reference.wav'), 'x')
    writeFileSync(join(root, 'reference.txt'), 'hello')
    expect(sampleHasReference(root)).toBe(true)
    expect(sampleReadyForTts(root)).toBe(true)
  })
})
