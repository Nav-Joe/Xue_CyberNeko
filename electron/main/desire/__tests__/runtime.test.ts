import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, expect, it } from 'vitest'

import { describeMemoryDb } from '../../memory/__tests__/sqliteProbe'
import { DESIRE_REUNION_STRONG_MS } from '../types'

describeMemoryDb('desire runtime (inject, no turn decay)', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('empty open desires → empty block; insert + reunion writes back', async () => {
    const { openMemoryDbAt } = await import('../../memory/dbCore')
    const { buildDesirePromptBlock } = await import('../runtime')
    const { insertDesireForTest, listOpenDesires } = await import('../store')

    const migrationsFolder = join(__dirname, '..', '..', 'memory', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-desire-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()
    const db = opened.db

    expect(buildDesirePromptBlock(db)).toBe('')

    const interacted = 1_000_000
    insertDesireForTest(db, {
      name: '想吃草莓',
      intensity: 9,
      patienceMax: 100,
      patienceRemaining: 5,
      nowMs: interacted
    })

    const block = buildDesirePromptBlock(db, {
      nowMs: interacted + DESIRE_REUNION_STRONG_MS
    })
    expect(block).toContain('想吃草莓')
    expect(block).toContain('当前欲望')

    const open = listOpenDesires(db)
    expect(open).toHaveLength(1)
    expect(open[0]?.patienceRemaining).toBe(45)
    expect(open[0]?.protectionTurnsRemaining).toBe(3)
    expect(open[0]?.state).toBe('active')
  })
})
