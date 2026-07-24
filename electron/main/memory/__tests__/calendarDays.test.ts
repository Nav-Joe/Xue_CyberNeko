import { describe, expect, it } from 'vitest'

import {
  calendarDaysBetween,
  isMultiMonthGap,
  monthsBetween,
  rawRetainCutoffMs,
  shouldTriggerMonth,
  shouldTriggerWeek,
  startOfLocalDay,
  toCalendarDay
} from '../calendarDays'

describe('calendarDaysBetween', () => {
  it('counts calendar days not wall-clock hours', () => {
    const a = new Date(2026, 6, 1, 23, 0, 0)
    const b = new Date(2026, 6, 2, 1, 0, 0)
    expect(calendarDaysBetween(a, b)).toBe(1)
  })
})

describe('shouldTriggerWeek dual condition', () => {
  const today = new Date(2026, 6, 20) // Jul 20

  it('triggers when oldest→today ≥7', () => {
    const oldest = new Date(2026, 6, 13) // 7 days before
    const newest = new Date(2026, 6, 13)
    expect(shouldTriggerWeek(oldest, newest, today)).toBe(true)
  })

  it('triggers when oldest→newest span ≥7 even if recent', () => {
    const oldest = new Date(2026, 6, 12)
    const newest = new Date(2026, 6, 19)
    expect(calendarDaysBetween(oldest, newest)).toBe(7)
    expect(shouldTriggerWeek(oldest, newest, today)).toBe(true)
  })

  it('does not trigger when both gaps <7', () => {
    const oldest = new Date(2026, 6, 16)
    const newest = new Date(2026, 6, 18)
    expect(shouldTriggerWeek(oldest, newest, today)).toBe(false)
  })
})

describe('shouldTriggerMonth dual condition', () => {
  const today = new Date(2026, 6, 20)

  it('triggers when oldest is previous calendar month', () => {
    const oldest = new Date(2026, 5, 15)
    const newest = new Date(2026, 5, 20)
    expect(monthsBetween(oldest, today)).toBe(1)
    expect(shouldTriggerMonth(oldest, newest, today)).toBe(true)
  })

  it('triggers when material itself spans months', () => {
    const oldest = new Date(2026, 5, 28)
    const newest = new Date(2026, 6, 5)
    expect(shouldTriggerMonth(oldest, newest, today)).toBe(true)
  })

  it('does not trigger within same month and span', () => {
    const oldest = new Date(2026, 6, 5)
    const newest = new Date(2026, 6, 18)
    expect(shouldTriggerMonth(oldest, newest, today)).toBe(false)
  })
})

describe('isMultiMonthGap', () => {
  it('is true when oldest is ≥2 months before today', () => {
    expect(isMultiMonthGap(new Date(2026, 4, 1), new Date(2026, 6, 20))).toBe(true)
    expect(isMultiMonthGap(new Date(2026, 5, 1), new Date(2026, 6, 20))).toBe(false)
  })
})

describe('rawRetainCutoffMs keep 2 calendar days', () => {
  it('keeps today and yesterday; older is before cutoff', () => {
    const now = new Date(2026, 6, 20, 15, 0, 0)
    const cutoff = rawRetainCutoffMs(now, 2)
    const yesterdayStart = startOfLocalDay(toCalendarDay(new Date(2026, 6, 19)))
    const twoDaysAgo = startOfLocalDay(toCalendarDay(new Date(2026, 6, 18)))
    expect(cutoff).toBe(yesterdayStart.getTime())
    expect(twoDaysAgo.getTime()).toBeLessThan(cutoff)
  })
})
