import { asc, eq, inArray, lt } from 'drizzle-orm'

import type { MemoryDatabase } from './dbCore'
import { newMemoryId } from './ids'
import {
  calendarDaysBetween,
  isMultiMonthGap,
  monthsBetween,
  rawRetainCutoffMs,
  shouldTriggerMonth,
  shouldTriggerWeek,
  startOfLocalDay,
  toCalendarDay
} from './calendarDays'
import { logInfo, logWarn } from '../logging/logger'
import { readChatConfigFile, toChatConfigView } from '../chat/chat-config'
import { tryPromoteToCorePool } from './corePool'
import { readMemoryFlags } from './flags'
import { memoryBudgetForMode, OPENAI_MEMORY_BUDGET } from './memoryBudgets'
import { summarizePeriodWithLlm } from './periodSummarizeLlm'
import { memoryMeta, periodSummaries, rawLogs, sessionSummaries } from './schema'
import { upsertUserProfileFromMonthly } from './userProfile'

const META_WEEKLY_ATTEMPT = 'last_weekly_attempt'
const META_MONTHLY_ATTEMPT = 'last_monthly_attempt'
/** 同会话内最小重试间隔（ms），避免狂打 LLM */
const ATTEMPT_COOLDOWN_MS = 60_000
/** 积压并一周：跨度 >7 且 <28 日历日 */
const WEEKLY_BACKLOG_MAX_DAYS = 28

export type PeriodRollupResult = {
  weeklyDone: number
  monthlyDone: number
  profileUpdated: boolean
  skipped?: string
}

function readMeta(db: MemoryDatabase, key: string): string | undefined {
  return db.select().from(memoryMeta).where(eq(memoryMeta.key, key)).get()?.value
}

function writeMeta(db: MemoryDatabase, key: string, value: string): void {
  const now = new Date()
  db.insert(memoryMeta)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: memoryMeta.key,
      set: { value, updatedAt: now }
    })
    .run()
}

function recentlyAttempted(db: MemoryDatabase, key: string, nowMs: number): boolean {
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

function listSessionSummariesAsc(db: MemoryDatabase) {
  return db.select().from(sessionSummaries).orderBy(asc(sessionSummaries.startedAt)).all()
}

function listWeeklyAsc(db: MemoryDatabase) {
  return db
    .select()
    .from(periodSummaries)
    .where(eq(periodSummaries.kind, 'weekly'))
    .orderBy(asc(periodSummaries.periodStart))
    .all()
}

/** 周/月成功写入后：significance≥9.5 且 emotion 开关开 → 尝试核心池（与会话总结同规则）。 */
function maybePromotePeriodToCore(
  db: MemoryDatabase,
  input: {
    periodId: string
    kind: 'weekly' | 'monthly'
    summary: string
    significance: number
    keywords: string[]
    memoryKind?: string
  }
): boolean {
  let emotionEnabled = true
  try {
    emotionEnabled = readMemoryFlags().memoryEmotionScoreEnabled
  } catch {
    /* 无 Electron 配置时默认开启（与产品默认一致） */
  }
  if (!emotionEnabled) return false

  let budget = OPENAI_MEMORY_BUDGET
  try {
    budget = memoryBudgetForMode(toChatConfigView(readChatConfigFile()).llmMode)
  } catch {
    /* vitest / 配置不可用 → OpenAI 档 */
  }

  const promo = tryPromoteToCorePool(db, {
    content: input.summary,
    significance: input.significance,
    keywords: input.keywords,
    memoryKind: input.memoryKind,
    sourceSession: input.periodId,
    category: input.kind === 'weekly' ? '周总结' : '月总结',
    budget
  })
  logInfo(
    'memory',
    `${input.kind} core promote`,
    `id=${input.periodId} significance=${input.significance} promoted=${promo.promoted} reason=${promo.reason}`
  )
  return promo.promoted
}

function pickWeekWindow<T extends { startedAt: Date; endedAt: Date | null }>(
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

async function runOneWeekly(
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

async function runOneMonthly(
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

/**
 * 对话开局异步调用：数月短路 → 周（可多次）→ 月。
 * 失败不删源；同会话有 cooldown。
 */
export async function maybeRunPeriodRollups(
  db: MemoryDatabase,
  now: Date = new Date()
): Promise<PeriodRollupResult> {
  const nowMs = now.getTime()
  let weeklyDone = 0
  let monthlyDone = 0
  let profileUpdated = false

  const sessions = listSessionSummariesAsc(db)

  const ssOldest = sessions[0]?.startedAt
  const multiMonth = ssOldest ? isMultiMonthGap(ssOldest, now) : false

  if (multiMonth) {
    if (!recentlyAttempted(db, META_MONTHLY_ATTEMPT, nowMs)) {
      const m = await runOneMonthly(db, now, { fromSessionSummaries: true })
      if (m.ok) {
        monthlyDone += 1
        try {
          const updated = await upsertUserProfileFromMonthly(db, m.id)
          if (updated) profileUpdated = true
        } catch (error) {
          logWarn('memory', 'profile update after monthly failed; monthly kept', error)
        }
      }
    }
    return { weeklyDone, monthlyDone, profileUpdated, skipped: 'multi_month_path' }
  }

  for (let i = 0; i < 4; i += 1) {
    if (recentlyAttempted(db, META_WEEKLY_ATTEMPT, nowMs) && weeklyDone === 0) break
    const w = await runOneWeekly(db, now)
    if (!w.ok) break
    weeklyDone += 1
  }

  if (!recentlyAttempted(db, META_MONTHLY_ATTEMPT, nowMs)) {
    const m = await runOneMonthly(db, now, { fromSessionSummaries: false })
    if (m.ok) {
      monthlyDone += 1
      try {
        const updated = await upsertUserProfileFromMonthly(db, m.id)
        if (updated) profileUpdated = true
      } catch (error) {
        logWarn('memory', 'profile update after monthly failed; monthly kept', error)
      }
    }
  }

  return { weeklyDone, monthlyDone, profileUpdated }
}

export {
  shouldTriggerWeek,
  shouldTriggerMonth,
  isMultiMonthGap,
  pickWeekWindow,
  META_WEEKLY_ATTEMPT,
  META_MONTHLY_ATTEMPT
}
