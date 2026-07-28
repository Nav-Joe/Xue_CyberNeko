import { afterEach, describe, expect, it, vi } from 'vitest'

import { scheduleMemoryBackground } from '../scheduleMemoryBackground'

describe('scheduleMemoryBackground', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not await the task (caller returns immediately)', async () => {
    let resolveTask!: () => void
    const gate = new Promise<void>((resolve) => {
      resolveTask = resolve
    })
    let finished = false

    scheduleMemoryBackground('test-gate', async () => {
      await gate
      finished = true
    })

    expect(finished).toBe(false)
    resolveTask()
    await gate
    await Promise.resolve()
    await Promise.resolve()
    expect(finished).toBe(true)
  })

  it('swallows rejected tasks without throwing to caller', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    scheduleMemoryBackground('test-reject', async () => {
      throw new Error('boom')
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('[memory-bg] test-reject')
  })
})
