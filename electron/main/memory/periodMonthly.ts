import { asc, eq, inArray } from 'drizzle-orm'

import { logInfo, logWarn } from '../logging/logger'
import { isMultiMonthGap, shouldTriggerMonth } from './calendarDays'
import type { MemoryDatabase } from './dbCore'
import { newMemoryId } from './ids'
import { maybePromotePeriodToCore } from './periodPromote'
import {
  META_MONTHLY_ATTEMPT,
  pruneRawLogsKeepRecentCalendarDays,
  writeMeta
} from './periodRollupMeta'
import { listSessionSummariesAsc } from './periodWeekly'
import { summarizePeriodWithLlm } from './periodSummarizeLlm'
import { periodSummaries, sessionSummaries } from './schema'

function listWeeklyAsc(db: MemoryDatabase) {
  return db
    .select()
    .from(periodSummaries)
    .where(eq(periodSummaries.kind, 'weekly'))
    .orderBy(asc(periodSummaries.periodStart))
    .all()
}

export async function runOneMonthly(
  db: MemoryDatabase,
  today: Date,
  opts: { fromSessionSummaries: boolean }
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (opts.fromSessionSummaries) {
    const rows = listSessionSummariesAsc(db)
    if (rows.length === 0) return { ok: false, reason: 'no_session_for_month' }
    const oldest = rows[0]!.startedAt
    const newest = rows[rows.length - 1]!.endedAt ?? rows[rows.length - 1]!.startedAt
    if (!shouldTriggerMonth(oldest, newest, today) && !isMultiMonthGap(oldest, today)) {
      return { ok: false, reason: 'month_not_due' }
    }

    writeMeta(db, META_MONTHLY_ATTEMPT, String(Date.now()))

    let parsed
    try {
      parsed = await summarizePeriodWithLlm(
        'monthly',
        rows.map((r) => ({
          summary: r.summary,
          keyFacts: r.keyFacts ?? [],
          keywords: r.keywords ?? [],
          startedAt: r.startedAt
        }))
      )
    } catch (error) {
      logWarn('memory', 'monthly(from SS) rollup LLM failed', error)
      return { ok: false, reason: 'llm_failed' }
    }

    const id = newMemoryId()
    const sourceIds = rows.map((r) => r.id)
    db.insert(periodSummaries)
      .values({
        id,
        kind: 'monthly',
        periodStart: oldest,
        periodEnd: newest,
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
    pruneRawLogsKeepRecentCalendarDays(db, 2, today)
    maybePromotePeriodToCore(db, {
      periodId: id,
      kind: 'monthly',
      summary: parsed.summary,
      significance: parsed.significance,
      keywords: parsed.keywords,
      memoryKind: parsed.memoryKind
    })
    logInfo('memory', 'monthly rollup from session_summaries ok', `id=${id}`)
    return { ok: true, id }
  }

  const weeklies = listWeeklyAsc(db)
  if (weeklies.length === 0) return { ok: false, reason: 'no_weeklies' }
  const oldest = weeklies[0]!.periodStart
  const newest = weeklies[weeklies.length - 1]!.periodEnd
  if (!shouldTriggerMonth(oldest, newest, today)) {
    return { ok: false, reason: 'month_not_due' }
  }

  writeMeta(db, META_MONTHLY_ATTEMPT, String(Date.now()))

  let parsed
  try {
    parsed = await summarizePeriodWithLlm(
      'monthly',
      weeklies.map((r) => ({
        summary: r.summary,
        keyFacts: r.keyFacts ?? [],
        keywords: r.keywords ?? [],
        periodStart: r.periodStart,
        periodEnd: r.periodEnd
      }))
    )
  } catch (error) {
    logWarn('memory', 'monthly rollup LLM failed', error)
    return { ok: false, reason: 'llm_failed' }
  }

  const id = newMemoryId()
  const sourceIds = weeklies.map((r) => r.id)
  db.insert(periodSummaries)
    .values({
      id,
      kind: 'monthly',
      periodStart: oldest,
      periodEnd: newest,
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
  db.delete(periodSummaries).where(inArray(periodSummaries.id, sourceIds)).run()
  pruneRawLogsKeepRecentCalendarDays(db, 2, today)
  maybePromotePeriodToCore(db, {
    periodId: id,
    kind: 'monthly',
    summary: parsed.summary,
    significance: parsed.significance,
    keywords: parsed.keywords,
    memoryKind: parsed.memoryKind
  })
  logInfo('memory', 'monthly rollup from weeklies ok', `id=${id}`)
  return { ok: true, id }
}
