import { describe, expect, it } from 'vitest'

import {
  extractOpenAiMessageContent,
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

  it('parses OpenAI completion body with content parts array (Gemini compat)', () => {
    const text = parseOpenAiCompletionBody({
      choices: [
        {
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: '屏幕' },
              { type: 'text', text: '摘要' }
            ]
          }
        }
      ]
    })
    expect(text).toBe('屏幕摘要')
  })

  it('extractOpenAiMessageContent returns empty for missing content', () => {
    expect(extractOpenAiMessageContent({})).toBe('')
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
