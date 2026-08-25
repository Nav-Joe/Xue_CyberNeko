import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createChatTtsSession } from '../../chatTtsSession'
import {
  playScreenCompanionNarrateTts,
  resolveScreenCompanionTtsParallelLanes
} from '../companionTtsPipeline'

vi.mock('../../chatTtsSession', () => ({
  createChatTtsSession: vi.fn()
}))

describe('resolveScreenCompanionTtsParallelLanes', () => {
  it('always returns 0', () => {
    expect(resolveScreenCompanionTtsParallelLanes()).toBe(0)
  })
})

describe('playScreenCompanionNarrateTts', () => {
  const mockSession = {
    enqueue: vi.fn(),
    enqueueAll: vi.fn(),
    markStreamComplete: vi.fn(),
    waitUntilIdle: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createChatTtsSession).mockReturnValue(mockSession)
  })

  it('splits on pause punctuation and forces serial lanes', async () => {
    await playScreenCompanionNarrateTts('我是雪澜，一只猫娘')
    expect(createChatTtsSession).toHaveBeenCalledWith(
      expect.objectContaining({ parallelLanes: 0 })
    )
    const items = vi.mocked(mockSession.enqueueAll).mock.calls[0]?.[0] as Array<{
      displaySegment: string
    }>
    expect(items).toHaveLength(2)
    expect(items[0]?.displaySegment).toBe('我是雪澜')
    expect(items[1]?.displaySegment).toBe('一只猫娘')
    expect(mockSession.waitUntilIdle).toHaveBeenCalled()
  })
})
