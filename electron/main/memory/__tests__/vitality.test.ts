import { describe, expect, it } from 'vitest'

import {
  computeVitality,
  matchContinuousOrSlidingWindow,
  normalizeForMatch,
  parseMemoryKind,
  scoreCoreMemoryHit
} from '../vitality'

describe('vitality', () => {
  it('maps memory kinds and half-life decay', () => {
    expect(parseMemoryKind('emotion_peak')).toBe('emotion_peak')
    expect(parseMemoryKind('unknown')).toBe('habit')
    const fresh = computeVitality({
      significance: 10,
      memoryKind: 'fact',
      hitCount: 0,
      createdAt: Date.now(),
      nowMs: Date.now()
    })
    expect(fresh).toBeCloseTo(10, 5)
    const aged = computeVitality({
      significance: 10,
      memoryKind: 'fact',
      hitCount: 0,
      createdAt: Date.now() - 7 * 86_400_000,
      nowMs: Date.now()
    })
    expect(aged).toBeCloseTo(10 * Math.exp(-1), 5)
  })

  it('hit boost via log1p', () => {
    const v = computeVitality({
      significance: 10,
      memoryKind: 'habit',
      hitCount: 2,
      createdAt: Date.now(),
      nowMs: Date.now()
    })
    expect(v).toBeCloseTo(10 * (1 + Math.log1p(4)), 5)
  })

  it('continuous string is strong; sliding window is weak', () => {
    expect(matchContinuousOrSlidingWindow('想吃草莓蛋糕', '草莓')).toBe('strong')
    expect(matchContinuousOrSlidingWindow('说晚安了吗', '睡前说晚安')).toBe('weak')
    expect(matchContinuousOrSlidingWindow('你好', '晚安')).toBe('none')
  })

  it('normalize strips punctuation before match', () => {
    expect(matchContinuousOrSlidingWindow('我们谈谈「感情」吧！', '感情')).toBe('strong')
  })

  it('normalize strips CN/EN quotes dashes and fullwidth tilde', () => {
    expect(normalizeForMatch('他说\u201c京都\u201d')).toBe('他说京都')
    expect(normalizeForMatch("it's love!")).toBe('itslove')
    expect(normalizeForMatch('2020\u20132021')).toBe('20202021')
    expect(normalizeForMatch('真的\uFF5E好')).toBe('真的好')
  })

  it('scores core hits preferring keywords; long content only strong', () => {
    expect(scoreCoreMemoryHit('草莓很好吃', ['草莓'], '很长的一段核心记忆正文不会随便弱命中')).toBe(
      'strong'
    )
    expect(scoreCoreMemoryHit('今天天气不错', ['草莓'], '很长的一段核心记忆正文不会随便弱命中')).toBe(
      'none'
    )
  })
})
