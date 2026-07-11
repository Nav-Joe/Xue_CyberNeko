import { describe, expect, it } from 'vitest'

import { classifyLlmChatError, LLM_CHAT_MAX_RETRIES } from '../llmChatRetry'

describe('classifyLlmChatError', () => {
  it('treats network and timeout errors as retryable', () => {
    expect(classifyLlmChatError(new Error('LLM 请求超时')).retryable).toBe(true)
    expect(classifyLlmChatError(new Error('fetch failed')).retryable).toBe(true)
    expect(classifyLlmChatError(new Error('无法连接 OpenAI API')).retryable).toBe(true)
  })

  it('treats server busy and 5xx as retryable', () => {
    expect(classifyLlmChatError(new Error('OpenAI API 503: server busy')).retryable).toBe(true)
    expect(classifyLlmChatError(new Error('OpenAI API 429: rate limit')).retryable).toBe(true)
  })

  it('treats auth and quota errors as hard failures', () => {
    expect(classifyLlmChatError(new Error('OpenAI API 401: invalid api key')).retryable).toBe(false)
    expect(classifyLlmChatError(new Error('OpenAI API 402: insufficient quota')).retryable).toBe(false)
    expect(classifyLlmChatError(new Error('请先在 OpenAI 配置中设置 API Key')).retryable).toBe(false)
  })

  it('treats config validation as hard failures', () => {
    expect(classifyLlmChatError(new Error('请先在本地模型列表中选择模型')).retryable).toBe(false)
  })

  it('exports max retry count of 3', () => {
    expect(LLM_CHAT_MAX_RETRIES).toBe(3)
  })
})
