import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { describeMemoryDb } from '../../memory/__tests__/sqliteProbe'
import { applyDesireProposal, parseDesireProposal } from '../proposal'
import { insertDesireForTest, listOpenDesires } from '../store'

describe('parseDesireProposal', () => {
  it('parses JSON and rejects garbage', () => {
    const ok = parseDesireProposal({
      desires: [{ id: null, action: 'create', name: '草莓', intensity: 8, patienceMax: 100 }]
    })
    expect(ok?.desires).toHaveLength(1)
    expect(parseDesireProposal('not-json')).toBeNull()
  })
})

describeMemoryDb('applyDesireProposal', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function openDb() {
    const { openMemoryDbAt } = await import('../../memory/dbCore')
    const migrationsFolder = join(__dirname, '..', '..', 'memory', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-desire-b-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()
    return opened.db
  }

  it('create max 1; unmentioned open get neutral (-1d)', async () => {
    const db = await openDb()
    const a = insertDesireForTest(db, {
      name: '陪聊',
      patienceMax: 100,
      patienceRemaining: 50,
      nowMs: 1000
    })
    const proposal = parseDesireProposal({
      desires: [
        { id: null, action: 'create', name: '草莓', intensity: 9, patienceMax: 80 },
        { id: null, action: 'create', name: '第二欲', intensity: 1, patienceMax: 50 }
      ]
    })
    expect(proposal).not.toBeNull()
    const result = applyDesireProposal(db, listOpenDesires(db), proposal!, 2000)
    expect(result.createdIds).toHaveLength(1)
    expect(result.createSkippedExtra).toBe(1)

    const open = listOpenDesires(db)
    const old = open.find((d) => d.id === a.id)
    expect(old?.patienceRemaining).toBe(49)
    expect(open.some((d) => d.name === '草莓')).toBe(true)
    expect(open.some((d) => d.name === '第二欲')).toBe(false)
  })

  it('keep ignored deducts -3d; fulfill closes', async () => {
    const db = await openDb()
    const a = insertDesireForTest(db, {
      name: '草莓',
      patienceRemaining: 40,
      nowMs: 1000
    })
    applyDesireProposal(
      db,
      listOpenDesires(db),
      {
        desires: [{ id: a.id, action: 'keep', outcome: 'ignored' }]
      },
      2000
    )
    expect(listOpenDesires(db)[0]?.patienceRemaining).toBe(37)

    applyDesireProposal(
      db,
      listOpenDesires(db),
      {
        desires: [{ id: a.id, action: 'fulfill' }]
      },
      3000
    )
    expect(listOpenDesires(db)).toHaveLength(0)
  })
})
