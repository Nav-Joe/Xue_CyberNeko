import { describe, expect, it } from 'vitest'

import { assistantDesireTriggerHit } from '../trigger'

describe('desire self-trigger keywords', () => {
  it('hits first-person desire phrases on assistant text', () => {
    expect(assistantDesireTriggerHit('呜，好想吃草莓…')).toBe(true)
    expect(assistantDesireTriggerHit('我想陪在你身边')).toBe(true)
    expect(assistantDesireTriggerHit('今天天气不错')).toBe(false)
    expect(assistantDesireTriggerHit('你想吃什么')).toBe(false)
  })
})
