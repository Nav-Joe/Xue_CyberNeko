import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { describeMemoryDb } from '../../memory/__tests__/sqliteProbe'
import { getRelationshipScores } from '../../relationship/store'
import { PET_TOUCH_AFFECTION_DAILY_CAP } from '../types'
import { getPetTouchDay, recordPetTouch } from '../store'

describeMemoryDb('petTouch store', () => {
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
    dir = mkdtempSync(join(tmpdir(), 'xue-pet-touch-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()
    return opened.db
  }

  it('records per-part counts without affection when grant off', async () => {
    const db = await openDb()
    const now = new Date(2026, 6, 31, 10, 0, 0).getTime()
    recordPetTouch(db, 'head', { nowMs: now, grantAffection: false })
    recordPetTouch(db, 'head', { nowMs: now, grantAffection: false })
    const snap = recordPetTouch(db, 'body', { nowMs: now, grantAffection: false })
    expect(snap.counts.head).toBe(2)
    expect(snap.counts.body).toBe(1)
    expect(snap.total).toBe(3)
    expect(snap.affectionGrants).toBe(0)
    expect(snap.affectionGranted).toBe(false)
    expect(getRelationshipScores(db).closeness).toBe(0)
  })

  it('starts a new row after local midnight', async () => {
    const db = await openDb()
    const day1 = new Date(2026, 6, 31, 23, 0, 0).getTime()
    const day2 = new Date(2026, 7, 1, 1, 0, 0).getTime()
    recordPetTouch(db, 'arms', { nowMs: day1, grantAffection: true })
    const next = recordPetTouch(db, 'arms', { nowMs: day2, grantAffection: true })
    expect(next.counts.arms).toBe(1)
    expect(next.total).toBe(1)
    expect(next.affectionGrants).toBe(1)
    expect(getPetTouchDay(db, day1).affectionGrants).toBe(1)
  })

  it('grants closeness micro up to daily cap then stops', async () => {
    const db = await openDb()
    const now = new Date(2026, 6, 31, 12, 0, 0).getTime()
    for (let i = 0; i < PET_TOUCH_AFFECTION_DAILY_CAP; i++) {
      const r = recordPetTouch(db, 'head', { nowMs: now + i, grantAffection: true })
      expect(r.affectionGranted).toBe(true)
    }
    expect(getRelationshipScores(db).closeness).toBeCloseTo(0.1)
    expect(getPetTouchDay(db, now).affectionGrants).toBe(10)

    const overflow = recordPetTouch(db, 'body', { nowMs: now + 100, grantAffection: true })
    expect(overflow.affectionGranted).toBe(false)
    expect(overflow.affectionGrants).toBe(10)
    expect(overflow.total).toBe(11)
    expect(getRelationshipScores(db).closeness).toBeCloseTo(0.1)
    expect(getRelationshipScores(db).trust).toBe(0)
  })
})
