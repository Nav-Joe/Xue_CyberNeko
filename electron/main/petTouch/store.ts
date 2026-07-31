/**
 * pet_touch_daily 读写（同一 memory.db；按本地日历日）。
 * 可选授予亲近 +0.01，全日合计封顶 PET_TOUCH_AFFECTION_DAILY_CAP。
 */
import { eq } from 'drizzle-orm'

import { calendarDayKey, toCalendarDay } from '../memory/calendarDays'
import type { MemoryDatabase } from '../memory/dbCore'
import { petTouchDaily } from '../memory/schema'
import { applyRelationshipDeltas } from '../relationship/engine'
import {
  getRelationshipScores,
  insertRelationshipEvents,
  saveRelationshipScores
} from '../relationship/store'
import {
  PET_TOUCH_AFFECTION_DAILY_CAP,
  PET_TOUCH_PARTS,
  type PetTouchDaySnapshot,
  type PetTouchPart,
  type RecordPetTouchResult
} from './types'

function asDate(ms: number): Date {
  return new Date(ms)
}

function emptyCounts(): Record<PetTouchPart, number> {
  return { head: 0, arms: 0, body: 0, legs: 0, tail: 0 }
}

function rowToSnapshot(row: {
  dayKey: string
  head: number
  arms: number
  body: number
  legs: number
  tail: number
  affectionGrants: number
}): PetTouchDaySnapshot {
  const counts: Record<PetTouchPart, number> = {
    head: row.head,
    arms: row.arms,
    body: row.body,
    legs: row.legs,
    tail: row.tail
  }
  const total = PET_TOUCH_PARTS.reduce((s, p) => s + counts[p], 0)
  return {
    dayKey: row.dayKey,
    counts,
    total,
    affectionGrants: row.affectionGrants,
    affectionCap: PET_TOUCH_AFFECTION_DAILY_CAP
  }
}

export function dayKeyFor(nowMs: number): string {
  return calendarDayKey(toCalendarDay(nowMs))
}

export function getPetTouchDay(db: MemoryDatabase, nowMs = Date.now()): PetTouchDaySnapshot {
  const dayKey = dayKeyFor(nowMs)
  const row = db.select().from(petTouchDaily).where(eq(petTouchDaily.dayKey, dayKey)).get()
  if (!row) {
    return {
      dayKey,
      counts: emptyCounts(),
      total: 0,
      affectionGrants: 0,
      affectionCap: PET_TOUCH_AFFECTION_DAILY_CAP
    }
  }
  return rowToSnapshot(row)
}

function tryGrantCloseness(
  db: MemoryDatabase,
  affectionGrants: number,
  nowMs: number
): { affectionGrants: number; affectionGranted: boolean } {
  if (affectionGrants >= PET_TOUCH_AFFECTION_DAILY_CAP) {
    return { affectionGrants, affectionGranted: false }
  }
  const before = getRelationshipScores(db)
  const { scores, events } = applyRelationshipDeltas(before, [
    { dimension: 'closeness', sign: 1, magnitude: 'micro', reason: 'pet_touch' }
  ])
  saveRelationshipScores(db, scores, nowMs)
  insertRelationshipEvents(db, events, 'pet_touch', nowMs)
  return { affectionGrants: affectionGrants + 1, affectionGranted: true }
}

/**
 * 记一次摸。
 * grantAffection=true 且未达全日封顶 → closeness +0.01 并记流水。
 * 非法 part → noop。
 */
export function recordPetTouch(
  db: MemoryDatabase,
  part: PetTouchPart,
  options?: { nowMs?: number; grantAffection?: boolean }
): RecordPetTouchResult {
  const nowMs = options?.nowMs ?? Date.now()
  const grantAffection = options?.grantAffection === true

  if (!PET_TOUCH_PARTS.includes(part)) {
    return { ...getPetTouchDay(db, nowMs), affectionGranted: false }
  }

  const dayKey = dayKeyFor(nowMs)
  const existing = db.select().from(petTouchDaily).where(eq(petTouchDaily.dayKey, dayKey)).get()

  const counts = existing
    ? {
        head: existing.head,
        arms: existing.arms,
        body: existing.body,
        legs: existing.legs,
        tail: existing.tail
      }
    : emptyCounts()
  counts[part] += 1

  let affectionGrants = existing?.affectionGrants ?? 0
  let affectionGranted = false
  if (grantAffection) {
    const g = tryGrantCloseness(db, affectionGrants, nowMs)
    affectionGrants = g.affectionGrants
    affectionGranted = g.affectionGranted
  }

  if (!existing) {
    db.insert(petTouchDaily)
      .values({
        dayKey,
        head: counts.head,
        arms: counts.arms,
        body: counts.body,
        legs: counts.legs,
        tail: counts.tail,
        affectionGrants,
        updatedAt: asDate(nowMs)
      })
      .run()
  } else {
    db.update(petTouchDaily)
      .set({
        head: counts.head,
        arms: counts.arms,
        body: counts.body,
        legs: counts.legs,
        tail: counts.tail,
        affectionGrants,
        updatedAt: asDate(nowMs)
      })
      .where(eq(petTouchDaily.dayKey, dayKey))
      .run()
  }

  return {
    ...rowToSnapshot({ dayKey, ...counts, affectionGrants }),
    affectionGranted
  }
}
