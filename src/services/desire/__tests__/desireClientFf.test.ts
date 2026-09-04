import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { maybeDesireAfterTurnInBackground } from '../desireClient'

describe('desireClient fire-and-forget', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI')
    vi.restoreAllMocks()
  })

  it('maybeDesireAfterTurnInBackground returns without awaiting IPC', async () => {
    const hang = vi.fn(() => new Promise(() => {}))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { desireApplyAfterTurn: hang }
    })

    const started = Date.now()
    maybeDesireAfterTurnInBackground({ userText: 'hi', assistantText: '喵' })
    expect(Date.now() - started).toBeLessThan(50)

    await Promise.resolve()
    await Promise.resolve()
    expect(hang).toHaveBeenCalledOnce()
  })
})
