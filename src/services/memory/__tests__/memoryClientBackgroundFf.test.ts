import { afterEach, describe, expect, it, vi } from 'vitest'

import { maybeMidSessionConsolidateInBackground, maybeRunPeriodRollup } from '../memoryClient'

describe('memoryClient background fire-and-forget', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI')
    vi.restoreAllMocks()
  })

  it('maybeRunPeriodRollup returns without awaiting IPC', async () => {
    const hang = vi.fn(() => new Promise(() => {}))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { memoryMaybePeriodRollup: hang }
    })

    const started = Date.now()
    maybeRunPeriodRollup()
    expect(Date.now() - started).toBeLessThan(50)

    await Promise.resolve()
    await Promise.resolve()
    expect(hang).toHaveBeenCalledOnce()
  })

  it('maybeMidSessionConsolidateInBackground returns without awaiting IPC', async () => {
    const hang = vi.fn(() => new Promise(() => {}))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { memoryMaybeMidSessionConsolidate: hang }
    })

    const started = Date.now()
    maybeMidSessionConsolidateInBackground('session-ff')
    expect(Date.now() - started).toBeLessThan(50)

    await Promise.resolve()
    await Promise.resolve()
    expect(hang).toHaveBeenCalledOnce()
  })
})
