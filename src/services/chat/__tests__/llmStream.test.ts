import { describe, expect, it } from 'vitest'

import { finalizeStreamContent } from '../llmOutputParser'
import { drainSseBuffer } from '../llmStream'

describe('llmStream', () => {
  it('drains SSE data lines', () => {
    const payloads: string[] = []
    const rest = drainSseBuffer('event: ping\ndata: {"a":1}\n\ndata: [DONE]\npartial', (p) =>
      payloads.push(p)
    )
    expect(payloads).toEqual(['{"a":1}', '[DONE]'])
    expect(rest).toBe('partial')
  })

  it('finalizes json_content stream text', () => {
    expect(finalizeStreamContent('{"text":"完整句"}', 'json_content')).toBe('完整句')
    expect(finalizeStreamContent('直接文本', 'openai')).toBe('直接文本')
  })
})
