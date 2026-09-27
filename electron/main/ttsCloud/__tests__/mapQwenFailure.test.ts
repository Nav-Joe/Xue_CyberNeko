import { describe, expect, it } from 'vitest'

import { mapQwenHttpFailure, mapQwenNetworkError, redactSecrets } from '../mapQwenFailure'

describe('mapQwenFailure', () => {
  it('maps common HTTP statuses', () => {
    expect(mapQwenHttpFailure(401)).toContain('API Key')
    expect(mapQwenHttpFailure(429)).toContain('频繁')
    expect(mapQwenHttpFailure(404)).toContain('baseUrl')
  })

  it('prefers dashscope message', () => {
    const detail = mapQwenHttpFailure(
      400,
      JSON.stringify({ code: 'InvalidParameter', message: 'bad voice Bearer sk-leak12345678' })
    )
    expect(detail).toContain('bad voice')
    expect(detail).not.toContain('sk-leak')
  })

  it('maps network errors', () => {
    const detail = mapQwenNetworkError(
      'https://dashscope.aliyuncs.com/api/v1/x',
      'fetch failed'
    )
    expect(detail).toContain('连不上百炼')
  })

  it('redacts bearer', () => {
    expect(redactSecrets('Bearer sk-abcdefghij')).toContain('Bearer ***')
  })
})
