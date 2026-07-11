import { describe, expect, it } from 'vitest'

import { formatLogLine, serializeError } from '../../../electron/main/logging/logger'

describe('logger', () => {
  it('serializes Error objects', () => {
    const err = new Error('boom')
    const out = serializeError(err)
    expect(out.message).toBe('boom')
    expect(out.stack).toContain('Error: boom')
  })

  it('formats log lines with scope and level', () => {
    const line = formatLogLine({
      level: 'ERROR',
      scope: 'main',
      message: 'startup failed',
      detail: 'code=1',
      at: new Date('2026-07-10T12:00:00.000+08:00')
    })
    expect(line).toContain('[ERROR]')
    expect(line).toContain('[main]')
    expect(line).toContain('startup failed')
    expect(line).toContain('code=1')
  })
})
