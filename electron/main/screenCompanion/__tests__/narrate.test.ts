import { describe, expect, it, vi } from 'vitest'

vi.mock('../../memory/summarizeLlm', () => ({
  completeMemoryChat: vi.fn(async () => '  哎呀这局有点意思。  ')
}))

vi.mock('../../chat/character-cards', () => ({
  readCharacterCardsFile: () => ({
    activeCardId: 'default',
    cards: [
      {
        id: 'default',
        name: '雪',
        rolePrompt: '你是猫娘陪伴者',
        likes: '游戏',
        createdAt: '',
        updatedAt: ''
      }
    ]
  })
}))

import { generateCompanionNarrate, buildNarrateMessages } from '../narrate'

describe('generateCompanionNarrate', () => {
  it('builds system+user messages for Gemini-compatible gateways', () => {
    const messages = buildNarrateMessages({
      gameName: 'DemoGame',
      observation: {
        ts: new Date().toISOString(),
        summary: '用户在打 Boss',
        usableForPrompt: true
      }
    })
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    expect(messages[1]?.role).toBe('user')
    expect(messages[1]?.content).toContain('用户在打 Boss')
  })

  it('returns trimmed line when observation usable', async () => {
    const line = await generateCompanionNarrate({
      gameName: 'DemoGame',
      observation: {
        ts: new Date().toISOString(),
        summary: '用户在打 Boss',
        usableForPrompt: true
      }
    })
    expect(line).toBe('哎呀这局有点意思。')
  })

  it('returns null when not usable', async () => {
    const line = await generateCompanionNarrate({
      gameName: 'DemoGame',
      observation: {
        ts: new Date().toISOString(),
        summary: 'fail',
        usableForPrompt: false
      }
    })
    expect(line).toBeNull()
  })
})
