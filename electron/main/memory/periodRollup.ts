import { logWarn } from '../logging/logger'
import { isMultiMonthGap, shouldTriggerMonth, shouldTriggerWeek } from './calendarDays'
import type { MemoryDatabase } from './dbCore'
import { runOneMonthly } from './periodMonthly'
import {
  META_MONTHLY_ATTEMPT,
  META_WEEKLY_ATTEMPT,
  pruneRawLogsKeepRecentCalendarDays,
  recentlyAttempted
} from './periodRollupMeta'
import { listSessionSummariesAsc, pickWeekWindow, runOneWeekly } from './periodWeekly'
import { upsertUserProfileFromMonthly } from './userProfile'

export type PeriodRollupResult = {
  weeklyDone: number
  monthlyDone: number
  profileUpdated: boolean
  skipped?: string
}

/**
 * 对话开局异步调用：数月短路 → 周（可多次）→ 月。
 * 失败不删源；同会话有 cooldown。
 *
 * 实现拆在 periodWeekly / periodMonthly / periodPromote / periodRollupMeta；
 * 本文件为唯一对外入口（meta/prune 经本模块 re-export）。
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
  isMultiMonthGap,
  META_MONTHLY_ATTEMPT,
  META_WEEKLY_ATTEMPT,
  pickWeekWindow,
  pruneRawLogsKeepRecentCalendarDays,
  shouldTriggerMonth,
  shouldTriggerWeek
}
