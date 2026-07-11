import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LLM_CHAT_MAX_RETRIES, llmChatWithRetry } from '../llmChatRetry'
import { llmChat } from '../llmClient'
import { createDefaultChatConfigView } from '../chatConfigDefaults'

vi.mock('../llmClient', () => ({
  llmChat: vi.fn()
}))

describe('llmChatWithRetry', () => {
  const config = createDefaultChatConfigView()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns on first success without retry hooks', async () => {
    vi.mocked(llmChat).mockResolvedValue({ content: 'hi' })
    const onRetry = vi.fn()

    const result = await llmChatWithRetry(
      config,
      { messages: [{ role: 'user', content: '你好' }] },
      undefined,
      { onRetry }
    )

    expect(result.content).toBe('hi')
    expect(llmChat).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('retries soft errors up to max then throws', async () => {
    vi.mocked(llmChat).mockRejectedValue(new Error('OpenAI API 503: busy'))
    const onRetry = vi.fn()

    await expect(
      llmChatWithRetry(config, { messages: [{ role: 'user', content: '你好' }] }, undefined, {
        onRetry
      })
    ).rejects.toThrow('OpenAI API 503: busy')

    expect(llmChat).toHaveBeenCalledTimes(LLM_CHAT_MAX_RETRIES + 1)
    expect(onRetry).toHaveBeenCalledTimes(LLM_CHAT_MAX_RETRIES)
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, LLM_CHAT_MAX_RETRIES, expect.any(Error))
    expect(onRetry).toHaveBeenNthCalledWith(3, 3, LLM_CHAT_MAX_RETRIES, expect.any(Error))
  })

  it('does not retry hard auth errors', async () => {
    vi.mocked(llmChat).mockRejectedValue(new Error('OpenAI API 401: invalid api key'))
    const onRetry = vi.fn()

    await expect(
      llmChatWithRetry(config, { messages: [{ role: 'user', content: '你好' }] }, undefined, {
        onRetry
      })
    ).rejects.toThrow('401')

    expect(llmChat).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })
  it('uses the stream handler created for each attempt', async () => {
    const handlers = [vi.fn(), vi.fn()]
    vi.mocked(llmChat)
      .mockImplementationOnce(async (_config, _request, onStream) => {
        onStream?.('first')
        throw new Error('OpenAI API 503: busy')
      })
      .mockImplementationOnce(async (_config, _request, onStream) => {
        onStream?.('second')
        return { content: 'second' }
      })

    const result = await llmChatWithRetry(
      config,
      { messages: [{ role: 'user', content: '你好' }], stream: true },
      (attempt) => handlers[attempt],
      { retryDelayMs: 0 }
    )

    expect(result.content).toBe('second')
    expect(handlers[0]).toHaveBeenCalledWith('first')
    expect(handlers[1]).toHaveBeenCalledWith('second')
  })
})
