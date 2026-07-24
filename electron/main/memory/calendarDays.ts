/** 本地日历日工具（只看 Y-M-D，不算严格 24h） */

export type CalendarDay = { y: number; m: number; d: number }

export function toCalendarDay(input: Date | number, now = input): CalendarDay {
  const dt = input instanceof Date ? input : new Date(input)
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() }
}

export function calendarDayKey(day: CalendarDay): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${day.y}-${pad(day.m)}-${pad(day.d)}`
}

export function startOfLocalDay(day: CalendarDay): Date {
  return new Date(day.y, day.m - 1, day.d, 0, 0, 0, 0)
}

export function endOfLocalDay(day: CalendarDay): Date {
  return new Date(day.y, day.m - 1, day.d, 23, 59, 59, 999)
}

/** |date(b)-date(a)| in calendar days */
export function calendarDaysBetween(a: Date | number, b: Date | number): number {
  const da = startOfLocalDay(toCalendarDay(a instanceof Date ? a : new Date(a)))
  const db = startOfLocalDay(toCalendarDay(b instanceof Date ? b : new Date(b)))
  return Math.round(Math.abs(db.getTime() - da.getTime()) / 86_400_000)
}

export function monthIndex(day: CalendarDay): number {
  return day.y * 12 + day.m
}

export function monthsBetween(a: Date | number, b: Date | number): number {
  const da = toCalendarDay(a instanceof Date ? a : new Date(a))
  const db = toCalendarDay(b instanceof Date ? b : new Date(b))
  return Math.abs(monthIndex(db) - monthIndex(da))
}

/** 保留最近 keepDays 个日历日（含今天）之外的 cutoff：早于该日 00:00 的可删 */
export function rawRetainCutoffMs(now: Date = new Date(), keepDays = 2): number {
  const today = toCalendarDay(now)
  const startToday = startOfLocalDay(today)
  const keepStart = new Date(startToday.getTime() - (keepDays - 1) * 86_400_000)
  return keepStart.getTime()
}

export function shouldTriggerWeek(
  oldest: Date,
  newest: Date,
  today: Date = new Date()
): boolean {
  const toToday = calendarDaysBetween(oldest, today)
  const span = calendarDaysBetween(oldest, newest)
  return toToday >= 7 || span >= 7
}

export function shouldTriggerMonth(
  oldest: Date,
  newest: Date,
  today: Date = new Date()
): boolean {
  return monthsBetween(oldest, today) >= 1 || monthsBetween(oldest, newest) >= 1
}

/** 跨数月：最旧距今天月份差 ≥ 2 */
export function isMultiMonthGap(oldest: Date, today: Date = new Date()): boolean {
  return monthsBetween(oldest, today) >= 2
}
