import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  noteRelationshipRoundMaybeEval,
  resetRelationshipTurnBuffer
} from '../relationshipClient'

describe('relationshipClient fire-and-forget', () => {
  afterEach(() => {
    resetRelationshipTurnBuffer()
    Reflect.deleteProperty(window, 'electronAPI')
    vi.restoreAllMocks()
  })

  it('noteRelationshipRoundMaybeEval returns without awaiting IPC when batch fires', async () => {
    const hang = vi.fn(() => new Promise(() => {}))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { relationshipApplyEval: hang }
    })

    const round = { userText: 'u', assistantText: 'a' }
    noteRelationshipRoundMaybeEval(round)
    noteRelationshipRoundMaybeEval(round)

    const started = Date.now()
    noteRelationshipRoundMaybeEval(round)
    expect(Date.now() - started).toBeLessThan(50)

    await Promise.resolve()
    await Promise.resolve()
    expect(hang).toHaveBeenCalledOnce()
  })
})
