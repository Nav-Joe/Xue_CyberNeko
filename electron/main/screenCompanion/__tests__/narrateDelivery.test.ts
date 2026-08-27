import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  estimateCompanionTtsWaitMs,
  notifyCompanionNarrateTtsDone,
  resetCompanionNarrateDelivery,
  waitForCompanionNarrateTtsDone
} from '../narrateDelivery'

describe('estimateCompanionTtsWaitMs', () => {
  it('uses at least 5 minutes for short lines', () => {
    expect(estimateCompanionTtsWaitMs('你好')).toBe(300_000)
  })

  it('scales with text length up to cap', () => {
    const long = 'x'.repeat(400)
    expect(estimateCompanionTtsWaitMs(long)).toBe(600_000)
  })
})

describe('waitForCompanionNarrateTtsDone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetCompanionNarrateDelivery()
  })

  afterEach(() => {
    resetCompanionNarrateDelivery()
    vi.useRealTimers()
  })

  it('resolves true when pet notifies done in time', async () => {
    const wait = waitForCompanionNarrateTtsDone(42, 60_000)
    notifyCompanionNarrateTtsDone({ ts: 42, ok: true })
    await expect(wait).resolves.toBe(true)
  })

  it('resolves false after max extends without notify', async () => {
    const wait = waitForCompanionNarrateTtsDone(7, 60_000)
    await vi.advanceTimersByTimeAsync(60_000 + 120_000 * 5)
    await expect(wait).resolves.toBe(false)
  })

  it('keeps waiting across extends until notify (no timeout false)', async () => {
    const wait = waitForCompanionNarrateTtsDone(7, 60_000)
    await vi.advanceTimersByTimeAsync(60_000 + 120_000 * 3)
    notifyCompanionNarrateTtsDone({ ts: 7, ok: true })
    await expect(wait).resolves.toBe(true)
  })

  it('resolves false only when superseded by reset', async () => {
    const wait = waitForCompanionNarrateTtsDone(9, 60_000)
    resetCompanionNarrateDelivery()
    await expect(wait).resolves.toBe(false)
  })
})
