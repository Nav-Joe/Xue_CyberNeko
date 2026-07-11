import { describe, expect, it } from 'vitest'

import {
  normalizeJsonContentAssistantText,
  parseCompletionBody,
  parseOpenAiCompletionBody,
  parseOpenAiStreamPayload,
  parseStreamPayload
} from '../llmOutputParser'

describe('llmOutputParser', () => {
  it('parses OpenAI completion body', () => {
    const text = parseOpenAiCompletionBody({
      choices: [{ message: { role: 'assistant', content: '你好' } }]
    })
    expect(text).toBe('你好')
  })

  it('parses json_content completion body', () => {
    const text = parseCompletionBody({ text: '喵~' }, 'json_content')
    expect(text).toBe('喵~')
  })

  it('unwraps json_content from OpenAI-shaped assistant string', () => {
    const wrapped = parseCompletionBody(
      { choices: [{ message: { content: '{"text":"雪澜在这里"}' } }] },
      'json_content'
    )
    expect(wrapped).toBe('雪澜在这里')
  })

  it('normalizes json string assistant text', () => {
    expect(normalizeJsonContentAssistantText('{"text":"OK"}')).toBe('OK')
    expect(normalizeJsonContentAssistantText('plain')).toBe('plain')
  })

  it('parses OpenAI stream delta', () => {
    const delta = parseOpenAiStreamPayload(
      JSON.stringify({ choices: [{ delta: { content: '你' } }] })
    )
    expect(delta).toBe('你')
  })

  it('parses json_content stream payload', () => {
    const delta = parseStreamPayload(JSON.stringify({ text: '分段' }), 'json_content')
    expect(delta).toBe('分段')
  })
})
