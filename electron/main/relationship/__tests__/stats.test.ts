import { describe, expect, it } from 'vitest'

import { aggregateRelationshipNet, formatRelNet, localDayBoundsMs } from '../stats'

describe('aggregateRelationshipNet (local calendar day)', () => {
  it('sums only events on the same local day', () => {
    const now = new Date(2026, 6, 31, 18, 0, 0).getTime() // Jul 31 2026 local
    const { startMs } = localDayBoundsMs(now)
    const yesterday = startMs - 60_000
    const todayMorning = startMs + 60_000

    const net = aggregateRelationshipNet(
      [
        { dimension: 'closeness', delta: 0.1, createdAtMs: todayMorning },
        { dimension: 'closeness', delta: -0.05, createdAtMs: todayMorning + 1 },
        { dimension: 'trust', delta: 0.5, createdAtMs: yesterday },
        { dimension: 'rapport', delta: 0.01, createdAtMs: todayMorning },
        { dimension: 'intimacy', delta: 9, createdAtMs: todayMorning }
      ],
      now
    )
    expect(net.closeness).toBeCloseTo(0.05)
    expect(net.trust).toBe(0)
    expect(net.rapport).toBe(0.01)
  })

  it('formatRelNet signs positive', () => {
    expect(formatRelNet(0)).toBe('0')
    expect(formatRelNet(0.1)).toBe('+0.1')
    expect(formatRelNet(-0.5)).toBe('-0.5')
  })
})
