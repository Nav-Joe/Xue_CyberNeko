import { describe, expect, it } from 'vitest'

import {
  applyRelationshipDeltas,
  clampScore,
  isNeutralStage,
  magnitudeToAbsDelta,
  resolveAllStageTags,
  resolveStageTag,
  stageBandIndex
} from '../engine'
import { REL_DELTA, type RelScores } from '../types'

const zero: RelScores = { closeness: 0, trust: 0, rapport: 0 }

describe('relationship engine · clamp', () => {
  it('clamps to [-10, 10] and maps non-finite to 0', () => {
    expect(clampScore(-11)).toBe(-10)
    expect(clampScore(11)).toBe(10)
    expect(clampScore(3.14)).toBe(3.14)
    expect(clampScore(Number.NaN)).toBe(0)
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('relationship engine · magnitude', () => {
  it('maps four magnitudes to locked deltas', () => {
    expect(magnitudeToAbsDelta('micro')).toBe(REL_DELTA.micro)
    expect(magnitudeToAbsDelta('medium')).toBe(REL_DELTA.medium)
    expect(magnitudeToAbsDelta('high')).toBe(REL_DELTA.high)
    expect(magnitudeToAbsDelta('extreme')).toBe(REL_DELTA.extreme)
  })
})

describe('relationship engine · stage bands', () => {
  it('pins boundary scores for (L,R] with -10/-10 floor', () => {
    expect(stageBandIndex(-10)).toBe(0)
    expect(stageBandIndex(-7.5)).toBe(0)
    expect(stageBandIndex(-7.49)).toBe(1)
    expect(stageBandIndex(-5)).toBe(1)
    expect(stageBandIndex(-4.99)).toBe(2)
    expect(stageBandIndex(-2.5)).toBe(2)
    expect(stageBandIndex(-2.49)).toBe(3)
    expect(stageBandIndex(0)).toBe(3)
    expect(stageBandIndex(2.5)).toBe(3)
    expect(stageBandIndex(2.51)).toBe(4)
    expect(stageBandIndex(5)).toBe(4)
    expect(stageBandIndex(5.01)).toBe(5)
    expect(stageBandIndex(7.5)).toBe(5)
    expect(stageBandIndex(7.51)).toBe(6)
    expect(stageBandIndex(10)).toBe(6)
  })

  it('resolves Chinese TAGs per dimension', () => {
    expect(resolveStageTag('closeness', -10)).toBe('厌恶')
    expect(resolveStageTag('closeness', 0)).toBe('正常')
    expect(resolveStageTag('closeness', 10)).toBe('爱意')
    expect(resolveStageTag('trust', -10)).toBe('心存芥蒂')
    expect(resolveStageTag('trust', 10)).toBe('毫不怀疑')
    expect(resolveStageTag('rapport', -10)).toBe('毫无交集')
    expect(resolveStageTag('rapport', 10)).toBe('灵魂双子')
    expect(isNeutralStage(resolveStageTag('trust', 0))).toBe(true)
  })

  it('resolveAllStageTags covers three dims', () => {
    expect(resolveAllStageTags({ closeness: 8, trust: -6, rapport: 0 })).toEqual({
      closeness: '爱意',
      trust: '满腹狐疑',
      rapport: '正常'
    })
  })
})

describe('relationship engine · applyDeltas', () => {
  it('applies multi-dim signed magnitudes and records original deltas', () => {
    const { scores, events } = applyRelationshipDeltas(zero, [
      { dimension: 'closeness', sign: 1, magnitude: 'high', reason: '暖' },
      { dimension: 'trust', sign: -1, magnitude: 'medium' },
      { dimension: 'rapport', sign: 1, magnitude: 'micro' }
    ])
    expect(scores).toEqual({
      closeness: 0.1,
      trust: -0.05,
      rapport: 0.01
    })
    expect(events).toEqual([
      { dimension: 'closeness', delta: 0.1, magnitude: 'high', reason: '暖' },
      { dimension: 'trust', delta: -0.05, magnitude: 'medium', reason: undefined },
      { dimension: 'rapport', delta: 0.01, magnitude: 'micro', reason: undefined }
    ])
  })

  it('records original delta even when clamp nets zero change', () => {
    const { scores, events } = applyRelationshipDeltas(
      { closeness: 10, trust: 0, rapport: 0 },
      [{ dimension: 'closeness', sign: 1, magnitude: 'extreme' }]
    )
    expect(scores.closeness).toBe(10)
    expect(events).toEqual([
      { dimension: 'closeness', delta: 0.5, magnitude: 'extreme', reason: undefined }
    ])
  })

  it('skips invalid dimension / magnitude / sign without throwing', () => {
    const { scores, events } = applyRelationshipDeltas(zero, [
      { dimension: 'closeness', sign: 1, magnitude: 'high' },
      // @ts-expect-error intentional invalid
      { dimension: 'intimacy', sign: 1, magnitude: 'high' },
      // @ts-expect-error intentional invalid
      { dimension: 'trust', sign: 1, magnitude: 'huge' },
      // @ts-expect-error intentional invalid
      { dimension: 'rapport', sign: 0, magnitude: 'micro' },
      { dimension: 'rapport', sign: -1, magnitude: 'extreme' }
    ])
    expect(scores).toEqual({ closeness: 0.1, trust: 0, rapport: -0.5 })
    expect(events).toHaveLength(2)
    expect(events.map((e) => e.dimension)).toEqual(['closeness', 'rapport'])
  })

  it('clamps input scores before applying', () => {
    const { scores } = applyRelationshipDeltas(
      { closeness: 99, trust: -99, rapport: 0 },
      [{ dimension: 'closeness', sign: -1, magnitude: 'micro' }]
    )
    expect(scores.closeness).toBe(9.99)
    expect(scores.trust).toBe(-10)
  })
})
