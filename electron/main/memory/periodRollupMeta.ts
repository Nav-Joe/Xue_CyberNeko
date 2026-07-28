import { eq, lt } from 'drizzle-orm'

import { rawRetainCutoffMs } from './calendarDays'
import type { MemoryDatabase } from './dbCore'
import { memoryMeta, rawLogs } from './schema'

export const META_WEEKLY_ATTEMPT = 'last_weekly_attempt'
export const META_MONTHLY_ATTEMPT = 'last_monthly_attempt'
/** 同会话内最小重试间隔（ms），避免狂打 LLM */
export const ATTEMPT_COOLDOWN_MS = 60_000

export function readMeta(db: MemoryDatabase, key: string): string | undefined {
  return db.select().from(memoryMeta).where(eq(memoryMeta.key, key)).get()?.value
}

export function writeMeta(db: MemoryDatabase, key: string, value: string): void {
  const now = new Date()
  db.insert(memoryMeta)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: memoryMeta.key,
      set: { value, updatedAt: now }
    })
    .run()
}

export function recentlyAttempted(db: MemoryDatabase, key: string, nowMs: number): boolean {
  const raw = readMeta(db, key)
  if (!raw) return false
  const t = Number(raw)
  if (!Number.isFinite(t)) return false
  return nowMs - t < ATTEMPT_COOLDOWN_MS
}

export function pruneRawLogsKeepRecentCalendarDays(
  db: MemoryDatabase,
  keepDays = 2,
  now: Date = new Date()
): number {
  const cutoff = rawRetainCutoffMs(now, keepDays)
  const result = db.delete(rawLogs).where(lt(rawLogs.timestamp, new Date(cutoff))).run()
  return Number(result.changes ?? 0)
}
