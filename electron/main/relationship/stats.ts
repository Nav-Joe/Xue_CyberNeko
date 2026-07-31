/**
 * 关系净变化聚合（按原始 delta 求和；UI 只展示净变化）。
 * 窗口：本地日历日 00:00～次日 00:00（与「今日」文案一致）。
 */
import {
  calendarDayKey,
  endOfLocalDay,
  startOfLocalDay,
  toCalendarDay
} from '../memory/calendarDays'
import type { RelDimension } from './types'
import { REL_DIMENSIONS } from './types'

export type RelEventForStats = {
  dimension: string
  delta: number
  createdAtMs: number
}

export type RelNetByDimension = Record<RelDimension, number>

export function emptyRelNetByDimension(): RelNetByDimension {
  return { closeness: 0, trust: 0, rapport: 0 }
}

export function localDayBoundsMs(nowMs: number): { startMs: number; endMs: number; dayKey: string } {
  const day = toCalendarDay(nowMs)
  return {
    dayKey: calendarDayKey(day),
    startMs: startOfLocalDay(day).getTime(),
    endMs: endOfLocalDay(day).getTime()
  }
}

/** 当日按维累加原始 delta → net */
export function aggregateRelationshipNet(
  events: RelEventForStats[],
  nowMs: number
): RelNetByDimension {
  const { startMs, endMs } = localDayBoundsMs(nowMs)
  const net = emptyRelNetByDimension()
  const dimSet = new Set<string>(REL_DIMENSIONS)
  for (const e of events) {
    if (e.createdAtMs < startMs || e.createdAtMs > endMs) continue
    if (!dimSet.has(e.dimension)) continue
    if (!Number.isFinite(e.delta)) continue
    net[e.dimension as RelDimension] += e.delta
  }
  return net
}

export function formatRelNet(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  const rounded = Math.round(n * 100) / 100
  const body = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return rounded > 0 ? `+${body}` : body
}
