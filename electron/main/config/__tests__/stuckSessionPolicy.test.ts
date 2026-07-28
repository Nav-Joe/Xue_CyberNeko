import { describe, expect, it } from 'vitest'

import { shouldClearStuckSession } from '../stuckSessionPolicy'

describe('shouldClearStuckSession（Electron / Python 统一表）', () => {
  it('非 create_voice → 不清', () => {
    expect(
      shouldClearStuckSession({ flow: null, phase: 'prewarming', sampleReady: false })
    ).toBe(false)
  })

  it('awaiting_review / completed / cancelled → 不清', () => {
    for (const phase of ['awaiting_review', 'completed', 'cancelled'] as const) {
      expect(
        shouldClearStuckSession({ flow: 'create_voice', phase, sampleReady: false })
      ).toBe(false)
    }
  })

  it('prewarming → 必清', () => {
    expect(
      shouldClearStuckSession({ flow: 'create_voice', phase: 'prewarming', sampleReady: true })
    ).toBe(true)
  })

  it('pending_restart / generating：样本齐保留，不齐则清', () => {
    expect(
      shouldClearStuckSession({
        flow: 'create_voice',
        phase: 'pending_restart',
        sampleReady: true
      })
    ).toBe(false)
    expect(
      shouldClearStuckSession({
        flow: 'create_voice',
        phase: 'pending_restart',
        sampleReady: false
      })
    ).toBe(true)
    expect(
      shouldClearStuckSession({ flow: 'create_voice', phase: 'generating', sampleReady: true })
    ).toBe(false)
    expect(
      shouldClearStuckSession({ flow: 'create_voice', phase: 'generating', sampleReady: false })
    ).toBe(true)
  })
})
