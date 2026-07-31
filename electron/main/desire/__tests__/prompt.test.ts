import { describe, expect, it } from 'vitest'

import { renderDesirePromptBlock } from '../prompt'
import type { DesireSnapshot } from '../types'

function snap(partial: Partial<DesireSnapshot> & Pick<DesireSnapshot, 'id' | 'name'>): DesireSnapshot {
  const now = 1_000_000
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

describe('renderDesirePromptBlock', () => {
  it('returns empty for no desires', () => {
    expect(renderDesirePromptBlock([])).toBe('')
  })

  it('renders urgent hint and protection hint', () => {
    const urgent = renderDesirePromptBlock([
      snap({ id: 'a', name: '草莓', patienceRemaining: 5, state: 'urgent' })
    ])
    expect(urgent).toContain('草莓')
    expect(urgent).toContain('撒泼')

    const protectedBlock = renderDesirePromptBlock([
      snap({
        id: 'b',
        name: '陪聊',
        patienceRemaining: 0,
        protectionTurnsRemaining: 2,
        state: 'active'
      })
    ])
    expect(protectedBlock).toContain('重逢缓冲')
    expect(protectedBlock).not.toContain('撒泼打滚表达不满')
  })
})
