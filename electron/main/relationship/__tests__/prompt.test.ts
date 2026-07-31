import { describe, expect, it } from 'vitest'

import { RELATIONSHIP_TAG_HINTS, renderRelationshipPromptBlock } from '../prompt'

describe('renderRelationshipPromptBlock', () => {
  it('always injects three dims; 正常 has no hint', () => {
    const block = renderRelationshipPromptBlock({ closeness: 0, trust: 0, rapport: 0 })
    expect(block.startsWith('【当前关系姿态（情感模拟）】')).toBe(true)
    expect(block).not.toContain('非真实情感')
    expect(block).toContain('- 亲近 0｜正常')
    expect(block).toContain('- 信任 0｜正常')
    expect(block).toContain('- 投契 0｜正常')
    expect(block).not.toContain('你很讨厌用户')
    expect(block).not.toContain('你完全不相信用户')
  })

  it('appends locked hints for extreme tags', () => {
    const block = renderRelationshipPromptBlock({
      closeness: -10,
      trust: 10,
      rapport: 8
    })
    expect(block).toContain(`厌恶：${RELATIONSHIP_TAG_HINTS['厌恶']}`)
    expect(block).toContain(`毫不怀疑：${RELATIONSHIP_TAG_HINTS['毫不怀疑']}`)
    expect(block).toContain(`灵魂双子：${RELATIONSHIP_TAG_HINTS['灵魂双子']}`)
  })

  it('mixes neutral and non-neutral lines', () => {
    const block = renderRelationshipPromptBlock({
      closeness: 4,
      trust: 0,
      rapport: -6
    })
    expect(block).toContain(`友好：${RELATIONSHIP_TAG_HINTS['友好']}`)
    expect(block).toMatch(/- 信任 0｜正常(\n|$)/)
    expect(block).toContain(`不合：${RELATIONSHIP_TAG_HINTS['不合']}`)
  })
})
