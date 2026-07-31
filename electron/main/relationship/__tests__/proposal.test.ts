import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { describeMemoryDb } from '../../memory/__tests__/sqliteProbe'
import { relationshipEvents } from '../../memory/schema'
import { applyRelationshipProposal, parseRelationshipProposal } from '../proposal'
import { getRelationshipScores } from '../store'
import { runRelationshipEvalWithParsed } from '../eval'

describe('parseRelationshipProposal', () => {
  it('parses changes and skips invalid rows', () => {
    const ok = parseRelationshipProposal({
      changes: [
        { dimension: 'closeness', sign: 1, magnitude: 'high', reason: '暖' },
        { dimension: 'intimacy', sign: 1, magnitude: 'high' },
        { dimension: 'trust', sign: 0, magnitude: 'micro' },
        { dimension: 'rapport', sign: -1, magnitude: 'huge' },
        { dimension: 'trust', sign: -1, magnitude: 'medium' }
      ]
    })
    expect(ok?.changes).toEqual([
      { dimension: 'closeness', sign: 1, magnitude: 'high', reason: '暖' },
      { dimension: 'trust', sign: -1, magnitude: 'medium', reason: undefined }
    ])
    expect(parseRelationshipProposal('not-json')).toBeNull()
    expect(parseRelationshipProposal({ changes: [] })?.changes).toEqual([])
  })

  it('accepts stringified JSON with sign as string', () => {
    const ok = parseRelationshipProposal(
      '{"changes":[{"dimension":"rapport","sign":"-1","magnitude":"extreme"}]}'
    )
    expect(ok?.changes).toEqual([
      { dimension: 'rapport', sign: -1, magnitude: 'extreme', reason: undefined }
    ])
  })
})

describeMemoryDb('applyRelationshipProposal', () => {
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
    dir = mkdtempSync(join(tmpdir(), 'xue-rel-r2-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()
    return opened.db
  }

  it('stacks same-dim changes and records original deltas', async () => {
    const db = await openDb()
    const proposal = parseRelationshipProposal({
      changes: [
        { dimension: 'closeness', sign: 1, magnitude: 'high' },
        { dimension: 'closeness', sign: 1, magnitude: 'micro' },
        { dimension: 'trust', sign: -1, magnitude: 'extreme' }
      ]
    })
    expect(proposal).not.toBeNull()
    const result = applyRelationshipProposal(db, proposal!, 'llm_turn', 5000)
    expect(result.applied).toBe(3)
    expect(result.scores.closeness).toBeCloseTo(0.11)
    expect(result.scores.trust).toBe(-0.5)
    expect(result.scores.rapport).toBe(0)

    const events = db.select().from(relationshipEvents).all()
    expect(events).toHaveLength(3)
    expect(events.map((e) => e.delta).sort((a, b) => a - b)).toEqual([-0.5, 0.01, 0.1])
    expect(events.every((e) => e.source === 'llm_turn')).toBe(true)
  })

  it('records original delta when clamp nets zero', async () => {
    const db = await openDb()
    applyRelationshipProposal(
      db,
      {
        changes: [{ dimension: 'rapport', sign: 1, magnitude: 'extreme' }]
      },
      'chat_close',
      1000
    )
    // push to ceiling then try again
    applyRelationshipProposal(
      db,
      {
        changes: Array.from({ length: 30 }, () => ({
          dimension: 'rapport' as const,
          sign: 1 as const,
          magnitude: 'extreme' as const
        }))
      },
      'llm_turn',
      2000
    )
    const scores = getRelationshipScores(db)
    expect(scores.rapport).toBe(10)

    const beforeCount = db.select().from(relationshipEvents).all().length
    applyRelationshipProposal(
      db,
      { changes: [{ dimension: 'rapport', sign: 1, magnitude: 'high' }] },
      'llm_turn',
      3000
    )
    expect(getRelationshipScores(db).rapport).toBe(10)
    const after = db
      .select()
      .from(relationshipEvents)
      .where(eq(relationshipEvents.delta, 0.1))
      .all()
    expect(after.length).toBeGreaterThanOrEqual(1)
    expect(db.select().from(relationshipEvents).all().length).toBe(beforeCount + 1)
  })

  it('empty changes is noop but ok via eval helper', async () => {
    const db = await openDb()
    const r = runRelationshipEvalWithParsed(db, { changes: [] }, 'chat_close', 9)
    expect(r).toMatchObject({ ok: true, applied: 0 })
    expect(getRelationshipScores(db)).toEqual({ closeness: 0, trust: 0, rapport: 0 })
  })
})
