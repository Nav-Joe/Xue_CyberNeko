import { asc, eq, inArray } from 'drizzle-orm'

import { logInfo, logWarn } from '../logging/logger'
import {
  calendarDaysBetween,
  isMultiMonthGap,
  monthsBetween,
  shouldTriggerWeek,
  startOfLocalDay,
  toCalendarDay
} from './calendarDays'
import type { MemoryDatabase } from './dbCore'
import { newMemoryId } from './ids'
import { maybePromotePeriodToCore } from './periodPromote'
import {
  META_WEEKLY_ATTEMPT,
  pruneRawLogsKeepRecentCalendarDays,
  writeMeta
} from './periodRollupMeta'
import { summarizePeriodWithLlm } from './periodSummarizeLlm'
import { periodSummaries, sessionSummaries } from './schema'

/** 积压并一周：跨度 >7 且 <28 日历日 */
const WEEKLY_BACKLOG_MAX_DAYS = 28

export function listSessionSummariesAsc(db: MemoryDatabase) {
  return db.select().from(sessionSummaries).orderBy(asc(sessionSummaries.startedAt)).all()
}

export function pickWeekWindow<T extends { startedAt: Date; endedAt: Date | null }>(
  rows: T[],
  today: Date
): { window: T[]; backlogMerge: boolean } | null {
  if (rows.length === 0) return null
  const oldest = rows[0]!.startedAt
  const newest = rows[rows.length - 1]!.endedAt ?? rows[rows.length - 1]!.startedAt
  if (!shouldTriggerWeek(oldest, newest, today)) return null

  if (isMultiMonthGap(oldest, today)) {
    return null
  }

  const span = calendarDaysBetween(oldest, newest)
  if (span > 7 && span < WEEKLY_BACKLOG_MAX_DAYS && monthsBetween(oldest, today) < 2) {
    return { window: rows, backlogMerge: true }
  }

  const start = startOfLocalDay(toCalendarDay(oldest))
  const endLimit = new Date(start.getTime() + 7 * 86_400_000)
  const window = rows.filter((r) => {
    const t = r.startedAt.getTime()
    return t >= start.getTime() && t < endLimit.getTime()
  })
  if (window.length === 0) return { window: rows.slice(0, 1), backlogMerge: false }
  return { window, backlogMerge: false }
}

export async function runOneWeekly(
  db: MemoryDatabase,
  today: Date
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const rows = listSessionSummariesAsc(db)
  if (rows.length === 0) return { ok: false, reason: 'no_session_summaries' }

  const oldest = rows[0]!.startedAt
  if (isMultiMonthGap(oldest, today)) {
    return { ok: false, reason: 'multi_month_skip_week' }
  }

  const picked = pickWeekWindow(rows, today)
  if (!picked) return { ok: false, reason: 'week_not_due' }

  const { window } = picked
  writeMeta(db, META_WEEKLY_ATTEMPT, String(Date.now()))

  let parsed
  try {
    parsed = await summarizePeriodWithLlm(
      'weekly',
      window.map((r) => ({
        summary: r.summary,
        keyFacts: r.keyFacts ?? [],
        keywords: r.keywords ?? [],
        startedAt: r.startedAt
      }))
    )
  } catch (error) {
    logWarn('memory', 'weekly rollup LLM failed; skip delete', error)
    return { ok: false, reason: 'llm_failed' }
  }

  const id = newMemoryId()
  const periodStart = window[0]!.startedAt
  const periodEnd =
    window[window.length - 1]!.endedAt ?? window[window.length - 1]!.startedAt
  const sourceIds = window.map((r) => r.id)

  db.insert(periodSummaries)
    .values({
      id,
      kind: 'weekly',
      periodStart,
      periodEnd,
      summary: parsed.summary,
      keyFacts: parsed.keyFacts,
      emotionTags: parsed.emotionTags,
      significance: parsed.significance,
      keywords: parsed.keywords,
      memoryKind: parsed.memoryKind,
      sourceIds,
      createdAt: new Date()
    })
    .run()

  db.delete(sessionSummaries).where(inArray(sessionSummaries.id, sourceIds)).run()
  const pruned = pruneRawLogsKeepRecentCalendarDays(db, 2, today)
  maybePromotePeriodToCore(db, {
    periodId: id,
    kind: 'weekly',
    summary: parsed.summary,
    significance: parsed.significance,
    keywords: parsed.keywords,
    memoryKind: parsed.memoryKind
  })
  logInfo(
    'memory',
    'weekly rollup ok',
    `id=${id} sources=${sourceIds.length} rawPruned=${pruned}`
  )
  return { ok: true, id }
}
