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
})
