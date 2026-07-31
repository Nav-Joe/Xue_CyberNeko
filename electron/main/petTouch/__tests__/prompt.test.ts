import { describe, expect, it } from 'vitest'

import { renderPetTouchPromptBlock } from '../prompt'
import { PET_TOUCH_AFFECTION_DAILY_CAP } from '../types'

describe('renderPetTouchPromptBlock', () => {
  it('includes totals and all parts only (no affection line)', () => {
    const block = renderPetTouchPromptBlock({
      dayKey: '2026-07-31',
      counts: { head: 2, arms: 1, body: 0, legs: 3, tail: 0 },
      total: 6,
      affectionGrants: 4,
      affectionCap: PET_TOUCH_AFFECTION_DAILY_CAP
    })
    expect(block.startsWith('【今日摸摸状况】')).toBe(true)
    expect(block).toContain('- 合计：6 次')
    expect(block).toContain('- 头部：2 次')
    expect(block).toContain('- 腿部：3 次')
    expect(block).not.toContain('亲近加分')
    expect(block).not.toContain('已达上限')
  })
})
