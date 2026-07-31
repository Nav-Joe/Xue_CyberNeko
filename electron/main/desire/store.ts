/**
 * desire_states 读写（同一 memory.db）。
 * 提供 list / save / upsert；正式创建走轮后 LLM 提议，不在此自动造欲望。
 */
import { eq, inArray } from 'drizzle-orm'

import type { MemoryDatabase } from '../memory/dbCore'
import { newMemoryId } from '../memory/ids'
import { desireStates, type DesireState } from '../memory/schema'
import type { DesireLifecycleState, DesireSnapshot } from './types'
import { isDesireOpen } from './engine'

function tsMs(value: Date | number | null | undefined): number | null {
  if (value == null) return null
  if (value instanceof Date) return value.getTime()
  return Number(value)
}

function asDate(ms: number): Date {
  return new Date(ms)
}

export function rowToDesireSnapshot(row: DesireState): DesireSnapshot {
  const state = row.state as DesireLifecycleState
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    intensity: row.intensity,
    patienceMax: row.patienceMax,
    patienceRemaining: row.patienceRemaining,
    state,
    decayRate: row.decayRate,
    protectionTurnsRemaining: row.protectionTurnsRemaining ?? 0,
    createdAt: tsMs(row.createdAt) ?? 0,
    updatedAt: tsMs(row.updatedAt) ?? 0,
    lastTickAt: tsMs(row.lastTickAt) ?? 0,
    lastInteractionAt: tsMs(row.lastInteractionAt) ?? 0,
    lastMentionedAt: tsMs(row.lastMentionedAt),
    deadline: tsMs(row.deadline)
  }
}

export function listOpenDesires(db: MemoryDatabase): DesireSnapshot[] {
  const rows = db
    .select()
    .from(desireStates)
    .where(inArray(desireStates.state, ['active', 'urgent']))
    .all()
  return rows.map(rowToDesireSnapshot).filter((d) => isDesireOpen(d.state))
}

export function saveDesireSnapshot(db: MemoryDatabase, desire: DesireSnapshot): void {
  db.update(desireStates)
    .set({
      name: desire.name,
      description: desire.description,
      intensity: desire.intensity,
      patienceMax: desire.patienceMax,
      patienceRemaining: desire.patienceRemaining,
      state: desire.state,
      decayRate: desire.decayRate,
      protectionTurnsRemaining: desire.protectionTurnsRemaining,
      updatedAt: asDate(desire.updatedAt),
      lastTickAt: asDate(desire.lastTickAt),
      lastInteractionAt: asDate(desire.lastInteractionAt),
      lastMentionedAt: desire.lastMentionedAt != null ? asDate(desire.lastMentionedAt) : null,
      deadline: desire.deadline != null ? asDate(desire.deadline) : null
    })
    .where(eq(desireStates.id, desire.id))
    .run()
}

export function saveDesireSnapshots(db: MemoryDatabase, desires: DesireSnapshot[]): void {
  for (const d of desires) {
    saveDesireSnapshot(db, d)
  }
}

/** 调试插入；不自动造欲望。不关闭其它活跃欲望（并行允许多条）。 */
export function insertDesireForTest(
  db: MemoryDatabase,
  input: {
    name: string
    description?: string
    intensity?: number
    patienceMax?: number
    patienceRemaining?: number
    state?: DesireLifecycleState
    decayRate?: number
    id?: string
    nowMs?: number
  }
): DesireSnapshot {
  const nowMs = input.nowMs ?? Date.now()
  const id = input.id ?? newMemoryId()
  const patienceMax = input.patienceMax ?? 100
  const patienceRemaining = input.patienceRemaining ?? patienceMax
  const snap: DesireSnapshot = {
    id,
    name: input.name.trim() || '未命名欲望',
    description: input.description?.trim() ?? '',
    intensity: input.intensity ?? 5,
    patienceMax,
    patienceRemaining,
    state: input.state ?? 'active',
    decayRate: input.decayRate ?? 1,
    protectionTurnsRemaining: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
    lastTickAt: nowMs,
    lastInteractionAt: nowMs,
    lastMentionedAt: null,
    deadline: null
  }
  db.insert(desireStates)
    .values({
      id: snap.id,
      name: snap.name,
      description: snap.description,
      intensity: snap.intensity,
      patienceMax: snap.patienceMax,
      patienceRemaining: snap.patienceRemaining,
      state: snap.state,
      decayRate: snap.decayRate,
      protectionTurnsRemaining: snap.protectionTurnsRemaining,
      createdAt: asDate(snap.createdAt),
      updatedAt: asDate(snap.updatedAt),
      lastTickAt: asDate(snap.lastTickAt),
      lastInteractionAt: asDate(snap.lastInteractionAt),
      lastMentionedAt: null,
      deadline: null
    })
    .run()
  return snap
}
