import { describe, expect, it } from 'vitest'

import { buildChatPromptMessages, formatCharacterSystemPrompt } from '../promptBuilder'

describe('promptBuilder', () => {
  const card = {
    id: 'default',
    name: '雪澜',
    rolePrompt: '你是温柔猫娘',
    likes: '晒太阳',
    createdAt: '',
    updatedAt: ''
  }

  it('formats system prompt with name and likes', () => {
    const text = formatCharacterSystemPrompt(card)
    expect(text).toContain('你是温柔猫娘')
    expect(text).toContain('雪澜')
    expect(text).toContain('晒太阳')
  })

  it('builds chat messages via ChatPromptTemplate', async () => {
    const messages = await buildChatPromptMessages({
      card,
      history: [{ role: 'user', content: '你好' }],
      userInput: '今天天气怎么样？'
    })
    expect(messages.some((m) => m.role === 'system' && m.content.includes('雪澜'))).toBe(true)
    expect(messages.some((m) => m.role === 'user' && m.content === '你好')).toBe(true)
    expect(messages.some((m) => m.role === 'user' && m.content === '今天天气怎么样？')).toBe(true)
  })

  it('appends memoryBlock into system prompt', async () => {
    const messages = await buildChatPromptMessages({
      card,
      history: [],
      userInput: '嗨',
      memoryBlock: '【核心记忆｜务必记住，无论当前话题】\n- (深爱) 我爱你'
    })
    const system = messages.find((m) => m.role === 'system')
    expect(system?.content).toContain('核心记忆')
    expect(system?.content).toContain('我爱你')
  })

  it('includes local clock in system prompt', async () => {
    const messages = await buildChatPromptMessages({
      card,
      history: [],
      userInput: '几点了',
      now: new Date(2026, 6, 23, 22, 57, 0)
    })
    const system = messages.find((m) => m.role === 'system')
    expect(system?.content).toContain('当前本地时间：2026-07-23 22:57（周四）')
  })
})
