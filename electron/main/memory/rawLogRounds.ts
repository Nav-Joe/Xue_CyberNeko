import { asc, inArray } from 'drizzle-orm'

import type { MemoryDatabase } from './dbCore'
import { rawLogs } from './schema'

export type RawLogRoundRow = {
  id: string
  sessionId: string
  role: string
  content: string
  timestamp: Date
}

/** 全库 raw_logs 按时间 ASC */
export function listAllRawLogsAsc(db: MemoryDatabase): RawLogRoundRow[] {
  return db
    .select({
      id: rawLogs.id,
      sessionId: rawLogs.sessionId,
      role: rawLogs.role,
      content: rawLogs.content,
      timestamp: rawLogs.timestamp
    })
    .from(rawLogs)
    .orderBy(asc(rawLogs.timestamp))
    .all()
}

/**
 * 1 轮 = user + 其后连续 assistant（与 historyWindow.splitHistoryIntoRounds 对齐）。
 * 孤立 assistant / system 跳过。
 */
export function splitRawLogsIntoRounds(logs: RawLogRoundRow[]): RawLogRoundRow[][] {
  const rounds: RawLogRoundRow[][] = []
  let current: RawLogRoundRow[] = []

  for (const row of logs) {
    if (row.role === 'user') {
      if (current.length > 0) rounds.push(current)
      current = [row]
      continue
    }
    if (row.role === 'assistant' && current.length > 0) {
      current.push(row)
    }
  }
  if (current.length > 0) rounds.push(current)
  return rounds
}

export function countGlobalRawLogRounds(db: MemoryDatabase): number {
  return splitRawLogsIntoRounds(listAllRawLogsAsc(db)).length
}

/**
 * 保留最近 keepRounds 轮，删除更早轮次对应的 raw_logs 行。
 * keepRounds≤0 时不删。
 */
export function pruneRawLogsToKeepRecentRounds(
  db: MemoryDatabase,
  keepRounds: number
): { deletedIds: string[]; prunedRounds: number; remainingRounds: number } {
  const keep = Math.max(0, Math.floor(keepRounds))
  const all = listAllRawLogsAsc(db)
  const rounds = splitRawLogsIntoRounds(all)
  if (keep <= 0 || rounds.length <= keep) {
    return { deletedIds: [], prunedRounds: 0, remainingRounds: rounds.length }
  }

  const toDrop = rounds.slice(0, rounds.length - keep).flat()
  const deletedIds = toDrop.map((r) => r.id)
  if (deletedIds.length > 0) {
    db.delete(rawLogs).where(inArray(rawLogs.id, deletedIds)).run()
  }
  return {
    deletedIds,
    prunedRounds: rounds.length - keep,
    remainingRounds: keep
  }
}

/** 取出最旧的 excess 轮（不删），供日常总结 transcript */
export function takeOldestRawLogRounds(
  db: MemoryDatabase,
  excessRounds: number
): RawLogRoundRow[] {
  const n = Math.max(0, Math.floor(excessRounds))
  if (n <= 0) return []
  const rounds = splitRawLogsIntoRounds(listAllRawLogsAsc(db))
  return rounds.slice(0, n).flat()
}
