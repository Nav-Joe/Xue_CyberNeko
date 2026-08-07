import { describe, expect, it } from 'vitest'

import { peakAbs, smoothLevel } from '../micLevel'

describe('micLevel', () => {
  it('peakAbs finds max absolute sample', () => {
    expect(peakAbs([-0.2, 0.5, -0.9, 0.1])).toBeCloseTo(0.9)
    expect(peakAbs([])).toBe(0)
  })

  it('smoothLevel rises faster than it falls', () => {
    const up = smoothLevel(0, 1, 0.35, 0.15)
    expect(up).toBeGreaterThan(0.3)
    const down = smoothLevel(1, 0, 0.35, 0.15)
    expect(down).toBeLessThan(0.9)
    expect(down).toBeGreaterThan(0.8)
  })

  it('smoothLevel clamps and floors tiny values', () => {
    expect(smoothLevel(0, 0)).toBe(0)
    expect(smoothLevel(2, 2)).toBe(1)
  })
})
