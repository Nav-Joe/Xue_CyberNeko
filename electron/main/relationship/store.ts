/**
 * relationship_states / relationship_events 读写（同一 memory.db）。
 */
import { eq, gte } from 'drizzle-orm'

import type { MemoryDatabase } from '../memory/dbCore'
import { newMemoryId } from '../memory/ids'
import { relationshipEvents, relationshipStates } from '../memory/schema'
import { clampScore } from './engine'
import type { RelEventForStats } from './stats'
import type { RelEventDraft, RelScores } from './types'

export const RELATIONSHIP_DEFAULT_ID = 'default'

export type RelEventSource = 'llm_turn' | 'chat_close' | 'pet_touch'

function asDate(ms: number): Date {
  return new Date(ms)
}

function tsMs(value: Date | number | null | undefined): number {
  if (value == null) return 0
  if (value instanceof Date) return value.getTime()
  return Number(value)
}

export function getRelationshipScores(db: MemoryDatabase): RelScores {
  const row = db
    .select()
    .from(relationshipStates)
    .where(eq(relationshipStates.id, RELATIONSHIP_DEFAULT_ID))
    .get()
  if (!row) {
    return { closeness: 0, trust: 0, rapport: 0 }
  }
  return {
    closeness: clampScore(row.closeness),
    trust: clampScore(row.trust),
    rapport: clampScore(row.rapport)
  }
}

/** 确保 default 行存在并写回三维分 */
export function saveRelationshipScores(
  db: MemoryDatabase,
  scores: RelScores,
  nowMs = Date.now()
): RelScores {
  const next = {
    closeness: clampScore(scores.closeness),
    trust: clampScore(scores.trust),
    rapport: clampScore(scores.rapport)
  }
  const existing = db
    .select()
    .from(relationshipStates)
    .where(eq(relationshipStates.id, RELATIONSHIP_DEFAULT_ID))
    .get()
  if (existing) {
    db.update(relationshipStates)
      .set({
        closeness: next.closeness,
        trust: next.trust,
        rapport: next.rapport,
        updatedAt: asDate(nowMs)
      })
      .where(eq(relationshipStates.id, RELATIONSHIP_DEFAULT_ID))
      .run()
  } else {
    db.insert(relationshipStates)
      .values({
        id: RELATIONSHIP_DEFAULT_ID,
        closeness: next.closeness,
        trust: next.trust,
        rapport: next.rapport,
        updatedAt: asDate(nowMs)
      })
      .run()
  }
  return next
}

export function insertRelationshipEvents(
  db: MemoryDatabase,
  drafts: RelEventDraft[],
  source: RelEventSource,
  nowMs = Date.now()
): number {
  if (drafts.length === 0) return 0
  let n = 0
  for (const draft of drafts) {
    db.insert(relationshipEvents)
      .values({
        id: newMemoryId(),
        dimension: draft.dimension,
        delta: draft.delta,
        magnitude: draft.magnitude,
        source,
        reason: draft.reason ?? null,
        createdAt: asDate(nowMs)
      })
      .run()
    n += 1
  }
  return n
}

/** 自 sinceMs（含）起的事件，供今日净变化等聚合 */
export function listRelationshipEventsSince(
  db: MemoryDatabase,
  sinceMs: number
): RelEventForStats[] {
  const rows = db
    .select()
    .from(relationshipEvents)
    .where(gte(relationshipEvents.createdAt, asDate(sinceMs)))
    .all()
  return rows.map((r) => ({
    dimension: r.dimension,
    delta: r.delta,
    createdAtMs: tsMs(r.createdAt)
  }))
}
