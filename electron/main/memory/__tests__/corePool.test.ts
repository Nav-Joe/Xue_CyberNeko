import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  CORE_POOL_MAX,
  CORE_POOL_MIN_SCORE,
  applyCoreMemoryHitsAndDecay,
  listCoreMemories,
  tryPromoteToCorePool
} from '../corePool'
import { CORE_PROMOTE_CONTEST_DISCOUNT, computeVitality } from '../vitality'
import { describeMemoryDb } from './sqliteProbe'

describe('core pool constants', () => {
  it('locks product thresholds', () => {
    expect(CORE_POOL_MAX).toBe(5)
    expect(CORE_POOL_MIN_SCORE).toBe(9.5)
    expect(CORE_PROMOTE_CONTEST_DISCOUNT).toBe(0.7)
  })
})

describeMemoryDb('tryPromoteToCorePool vitality contest', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function openDb() {
    const { openMemoryDbAt } = await import('../dbCore')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-core-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()
    return opened.db
  }

  it('inserts when below max and score high enough', async () => {
    const db = await openDb()
    const r = tryPromoteToCorePool(db, {
      content: '我深爱着用户',
      significance: 9.8,
      keywords: ['深爱'],
      memoryKind: 'emotion_peak'
    })
    expect(r.promoted).toBe(true)
    const rows = listCoreMemories(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.significance).toBe(9.8)
    expect(rows[0]!.memoryKind).toBe('emotion_peak')
    expect(rows[0]!.weight).toBeCloseTo(9.8, 5)
  })

  it('equal contest score keeps existing (no random)', async () => {
    const db = await openDb()
    const now = Date.now()
    for (let i = 0; i < CORE_POOL_MAX; i += 1) {
      tryPromoteToCorePool(db, {
        content: `核心事实${i}`,
        significance: 9.5,
        keywords: [`k${i}`],
        memoryKind: 'habit',
        nowMs: now
      })
    }
    // 新条 entryVitality=9.5，×0.7=6.65 < 池内 9.5 → 失败
    const r = tryPromoteToCorePool(db, {
      content: '新的并列核心',
      significance: 9.5,
      keywords: ['新'],
      memoryKind: 'habit',
      nowMs: now
    })
    expect(r.promoted).toBe(false)
    expect(r.reason).toBe('weaker_than_pool')
    expect(listCoreMemories(db)).toHaveLength(CORE_POOL_MAX)
  })

  it('replaces when discounted vitality beats aged lowest', async () => {
    const db = await openDb()
    const oldMs = Date.now() - 40 * 86_400_000
    for (let i = 0; i < CORE_POOL_MAX; i += 1) {
      tryPromoteToCorePool(db, {
        content: `旧核心${i}`,
        significance: 9.5,
        keywords: [`old${i}`],
        memoryKind: 'fact',
        nowMs: oldMs
      })
    }
    const now = Date.now()
    const lowestBefore = Math.min(
      ...listCoreMemories(db).map((r) =>
        computeVitality({
          significance: r.significance,
          memoryKind: r.memoryKind,
          hitCount: r.hitCount,
          createdAt: r.createdAt,
          nowMs: now
        })
      )
    )
    const candidate = 10 * CORE_PROMOTE_CONTEST_DISCOUNT
    expect(candidate).toBeGreaterThan(lowestBefore)

    const r = tryPromoteToCorePool(db, {
      content: '崭新高分核心',
      significance: 10,
      keywords: ['新高'],
      memoryKind: 'emotion_peak',
      nowMs: now
    })
    expect(r.promoted).toBe(true)
    expect(r.reason).toBe('replaced')
    expect(listCoreMemories(db).some((row) => row.content === '崭新高分核心')).toBe(true)
  })

  it('applyCoreMemoryHitsAndDecay bumps strong keyword hit', async () => {
    const db = await openDb()
    tryPromoteToCorePool(db, {
      content: '用户喜欢草莓',
      significance: 9.6,
      keywords: ['草莓'],
      memoryKind: 'habit'
    })
    const { hitRows } = applyCoreMemoryHitsAndDecay(db, '今天想吃草莓蛋糕')
    expect(hitRows).toBe(1)
    const row = listCoreMemories(db)[0]!
    expect(row.hitCount).toBe(2)
    expect(row.weight).toBeGreaterThan(9.6)
  })
})
