import { describe, expect, it } from 'vitest'

import {
  applyDesireTurn,
  applyDesireTurns,
  patienceRatio,
  prepareDesiresForTurn,
  refreshOpenDesireState,
  resolvePatienceStage,
  selectDesiresForPromptInject,
  softReunionDesire
} from '../engine'
import type { DesireSnapshot } from '../types'
import {
  DESIRE_PROTECTION_TURNS,
  DESIRE_REUNION_LIGHT_MS,
  DESIRE_REUNION_STRONG_MS
} from '../types'

function snap(partial: Partial<DesireSnapshot> & Pick<DesireSnapshot, 'id' | 'name'>): DesireSnapshot {
  const now = partial.lastInteractionAt ?? 1_000_000
  return {
    description: '',
    intensity: 8,
    patienceMax: 100,
    patienceRemaining: 100,
    state: 'active',
    decayRate: 1,
    protectionTurnsRemaining: 0,
    createdAt: now,
    updatedAt: now,
    lastTickAt: now,
    lastInteractionAt: now,
    lastMentionedAt: null,
    deadline: null,
    ...partial
  }
}

describe('desire engine · patience stage', () => {
  it('maps ratio bands without using intensity', () => {
    expect(resolvePatienceStage(snap({ id: 'a', name: 'x', patienceRemaining: 80 }))).toBe('calm')
    expect(resolvePatienceStage(snap({ id: 'a', name: 'x', patienceRemaining: 40 }))).toBe('restless')
    expect(resolvePatienceStage(snap({ id: 'a', name: 'x', patienceRemaining: 20 }))).toBe('urgent')
    expect(resolvePatienceStage(snap({ id: 'a', name: 'x', patienceRemaining: 0 }))).toBe('urgent')
  })

  it('protection clamps state to active even when ratio is urgent', () => {
    const d = refreshOpenDesireState(
      snap({
        id: 'a',
        name: '草莓',
        patienceRemaining: 0,
        state: 'urgent',
        protectionTurnsRemaining: 2
      })
    )
    expect(d.state).toBe('active')
  })
})

describe('desire engine · turn deltas (pure constants)', () => {
  const t0 = 2_000_000

  it('ignored -3d, neutral -1d, advanced +5d; intensity does not change delta', () => {
    const base = snap({
      id: 'a',
      name: '草莓',
      intensity: 10,
      patienceRemaining: 50,
      lastInteractionAt: t0
    })
    expect(applyDesireTurn(base, 'ignored', t0 + 1).patienceRemaining).toBe(47)
    expect(applyDesireTurn(base, 'neutral', t0 + 1).patienceRemaining).toBe(49)
    expect(applyDesireTurn({ ...base, patienceRemaining: 50 }, 'advanced', t0 + 1).patienceRemaining).toBe(
      55
    )
    const lowI = applyDesireTurn({ ...base, intensity: 1 }, 'ignored', t0 + 1)
    expect(lowI.patienceRemaining).toBe(47)
  })

  it('decayRate scales deltas', () => {
    const base = snap({
      id: 'a',
      name: 'x',
      decayRate: 2,
      patienceRemaining: 50,
      lastInteractionAt: t0
    })
    expect(applyDesireTurn(base, 'ignored', t0 + 1).patienceRemaining).toBe(44)
  })

  it('fulfilled / abandon terminate without patience math', () => {
    const base = snap({ id: 'a', name: 'x', patienceRemaining: 10, state: 'urgent' })
    expect(applyDesireTurn(base, 'fulfilled', t0).state).toBe('fulfilled')
    expect(applyDesireTurn(base, 'abandon', t0).state).toBe('abandoned')
  })

  it('evaluates parallel desires independently', () => {
    const a = snap({ id: 'a', name: '草莓', patienceRemaining: 50 })
    const b = snap({ id: 'b', name: '陪聊', patienceRemaining: 50 })
    const next = applyDesireTurns([a, b], { a: 'ignored', b: 'advanced' }, t0)
    expect(next.find((d) => d.id === 'a')?.patienceRemaining).toBe(47)
    expect(next.find((d) => d.id === 'b')?.patienceRemaining).toBe(55)
  })
})

describe('desire engine · reunion + protection', () => {
  const interacted = 1_000_000

  it('gap < 12h does nothing', () => {
    const d = snap({ id: 'a', name: 'x', lastInteractionAt: interacted, patienceRemaining: 10 })
    const r = softReunionDesire(d, interacted + DESIRE_REUNION_LIGHT_MS - 1)
    expect(r.applied).toBe('none')
    expect(r.desire.patienceRemaining).toBe(10)
  })

  it('light reunion raises P and starts protection; wall clock never decreases P', () => {
    const d = snap({
      id: 'a',
      name: 'x',
      lastInteractionAt: interacted,
      patienceRemaining: 10,
      state: 'urgent'
    })
    const r = softReunionDesire(d, interacted + DESIRE_REUNION_LIGHT_MS)
    expect(r.applied).toBe('light')
    expect(r.desire.patienceRemaining).toBe(25)
    expect(r.desire.protectionTurnsRemaining).toBe(DESIRE_PROTECTION_TURNS)
    expect(r.desire.state).toBe('active')
  })

  it('strong reunion floors at 0.45 Pmax and clears urgent', () => {
    const d = snap({
      id: 'a',
      name: 'x',
      lastInteractionAt: interacted,
      patienceRemaining: 5,
      state: 'urgent'
    })
    const r = softReunionDesire(d, interacted + DESIRE_REUNION_STRONG_MS)
    expect(r.applied).toBe('strong')
    expect(r.desire.patienceRemaining).toBe(45)
    expect(r.desire.state).toBe('active')
    expect(r.desire.protectionTurnsRemaining).toBe(3)
  })

  it('protected ignored uses -0.5d and cannot go urgent for 3 turns', () => {
    let d = snap({
      id: 'a',
      name: '草莓',
      patienceRemaining: 1,
      patienceMax: 100,
      protectionTurnsRemaining: 3,
      state: 'active',
      lastInteractionAt: interacted
    })
    const t = interacted
    d = applyDesireTurn(d, 'ignored', t + 1)
    expect(d.patienceRemaining).toBe(0.5)
    expect(d.protectionTurnsRemaining).toBe(2)
    expect(d.state).toBe('active')

    d = applyDesireTurn(d, 'ignored', t + 2)
    expect(d.patienceRemaining).toBe(0)
    expect(d.protectionTurnsRemaining).toBe(1)
    expect(d.state).toBe('active')

    d = applyDesireTurn(d, 'ignored', t + 3)
    expect(d.protectionTurnsRemaining).toBe(0)
    expect(d.state).toBe('urgent')
  })

  it('prepareDesiresForTurn only soft-reunions', () => {
    const d = snap({
      id: 'a',
      name: 'x',
      lastInteractionAt: interacted,
      patienceRemaining: 5,
      state: 'urgent'
    })
    const [out] = prepareDesiresForTurn([d], interacted + DESIRE_REUNION_STRONG_MS)
    expect(out.patienceRemaining).toBe(45)
    expect(patienceRatio(out)).toBeCloseTo(0.45)
  })
})

describe('desire engine · Top-N inject selection', () => {
  it('prefers urgent then lower ratio; caps at N', () => {
    const list = [
      snap({ id: 'calm', name: 'a', patienceRemaining: 90, state: 'active', intensity: 9 }),
      snap({ id: 'u1', name: 'b', patienceRemaining: 5, state: 'urgent', intensity: 3 }),
      snap({ id: 'u2', name: 'c', patienceRemaining: 10, state: 'urgent', intensity: 8 }),
      snap({ id: 'rest', name: 'd', patienceRemaining: 40, state: 'active', intensity: 1 }),
      snap({ id: 'done', name: 'e', patienceRemaining: 0, state: 'fulfilled' })
    ]
    const top = selectDesiresForPromptInject(list, 3)
    expect(top.map((d) => d.id)).toEqual(['u1', 'u2', 'rest'])
  })
})
