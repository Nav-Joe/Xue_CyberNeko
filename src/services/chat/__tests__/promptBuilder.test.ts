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

  it('appends desireBlock after memoryBlock in system prompt', async () => {
    const messages = await buildChatPromptMessages({
      card,
      history: [],
      userInput: '嗨',
      memoryBlock: '【核心记忆】\n- 记得用户',
      desireBlock: '【当前欲望（情感模拟·非真实生理需求）】\n- 欲望：草莓'
    })
    const system = messages.find((m) => m.role === 'system')?.content ?? ''
    expect(system).toContain('核心记忆')
    expect(system).toContain('当前欲望')
    expect(system.indexOf('核心记忆')).toBeLessThan(system.indexOf('当前欲望'))
  })

  it('appends relationshipBlock after desireBlock in system prompt', async () => {
    const messages = await buildChatPromptMessages({
      card,
      history: [],
      userInput: '嗨',
      memoryBlock: '【核心记忆】\n- 记得用户',
      desireBlock: '【当前欲望】\n- 欲望：草莓',
      relationshipBlock: '【当前关系姿态（情感模拟）】\n- 亲近 0｜正常'
    })
    const system = messages.find((m) => m.role === 'system')?.content ?? ''
    expect(system).toContain('当前关系姿态')
    expect(system.indexOf('核心记忆')).toBeLessThan(system.indexOf('当前欲望'))
    expect(system.indexOf('当前欲望')).toBeLessThan(system.indexOf('当前关系姿态'))
  })

  it('appends petTouchBlock after relationshipBlock in system prompt', async () => {
    const messages = await buildChatPromptMessages({
      card,
      history: [],
      userInput: '嗨',
      relationshipBlock: '【当前关系姿态（情感模拟）】\n- 亲近 0｜正常',
      petTouchBlock: '【今日摸摸状况】\n- 合计：2 次'
    })
    const system = messages.find((m) => m.role === 'system')?.content ?? ''
    expect(system).toContain('今日摸摸状况')
    expect(system.indexOf('当前关系姿态')).toBeLessThan(system.indexOf('今日摸摸状况'))
  })
})
