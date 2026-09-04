import { describe, expect, it, vi } from 'vitest'
import { isCompanionChatSendBlocked } from '../companionChatLock'

describe('isCompanionChatSendBlocked (companion chat lock)', () => {
  it('blocks only when sessionActive', () => {
    expect(isCompanionChatSendBlocked(false)).toBe(false)
    expect(isCompanionChatSendBlocked(true)).toBe(true)
  })

  it('guard pattern: inactive runs action; active skips action', async () => {
    const action = vi.fn()
    const showDialog = vi.fn(async () => undefined)

    if (!isCompanionChatSendBlocked(false)) {
      await action()
    } else {
      await showDialog()
    }
    expect(action).toHaveBeenCalledTimes(1)
    expect(showDialog).not.toHaveBeenCalled()

    action.mockClear()
    if (!isCompanionChatSendBlocked(true)) {
      await action()
    } else {
      await showDialog()
    }
    expect(action).not.toHaveBeenCalled()
    expect(showDialog).toHaveBeenCalledTimes(1)
  })
})
