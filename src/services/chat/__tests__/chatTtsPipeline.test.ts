import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createChatSegmentCoordinator } from '../chatTtsPipeline'
import { createChatTtsSession } from '../../chatTtsSession'

vi.mock('../../chatTtsSession', () => ({
  createChatTtsSession: vi.fn()
}))

describe('createChatSegmentCoordinator', () => {
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

  it('reveals segments without TTS when disabled', async () => {
    const revealed: string[] = []
    const coordinator = createChatSegmentCoordinator({
      ttsEnabled: false,
      onRevealSegment: (seg) => revealed.push(seg)
    })
    coordinator.pushDelta('你好呀。')
    await coordinator.flush()
    expect(revealed).toEqual(['你好呀。'])
    expect(createChatTtsSession).not.toHaveBeenCalled()
  })

  it('enqueues TTS segments with emoji and kaomoji stripped for synthesis', async () => {
    const revealed: string[] = []
    const coordinator = createChatSegmentCoordinator({
      ttsEnabled: true,
      onRevealSegment: (seg) => revealed.push(seg)
    })
    coordinator.pushDelta('开心(´▽`)呀。')
    await coordinator.flush()
    expect(mockSession.enqueue).toHaveBeenCalledWith('开心(´▽`)呀。', '开心呀。')
    expect(mockSession.markStreamComplete).toHaveBeenCalledTimes(1)
    expect(mockSession.waitUntilIdle).toHaveBeenCalled()
  })

  it('enqueues TTS segments with emoji stripped for synthesis', async () => {
    const revealed: string[] = []
    const coordinator = createChatSegmentCoordinator({
      ttsEnabled: true,
      onRevealSegment: (seg) => revealed.push(seg)
    })
    coordinator.pushDelta('开心😊呀。')
    await coordinator.flush()
    expect(mockSession.enqueue).toHaveBeenCalledWith('开心😊呀。', '开心呀。')
    expect(mockSession.markStreamComplete).toHaveBeenCalledTimes(1)
    expect(mockSession.waitUntilIdle).toHaveBeenCalled()
  })

  it('pushDelta + flush only enqueues each segment once', async () => {
    const coordinator = createChatSegmentCoordinator({
      ttsEnabled: true,
      onRevealSegment: () => {}
    })
    coordinator.pushDelta('第一句。第二')
    coordinator.pushDelta('句！')
    await coordinator.flush()
    expect(mockSession.enqueue).toHaveBeenCalledTimes(2)
    expect(mockSession.enqueue).toHaveBeenNthCalledWith(1, '第一句。', '第一句。')
    expect(mockSession.enqueue).toHaveBeenNthCalledWith(2, '第二句！', '第二句！')
  })

  it('revealFullText splits and enqueues all segments at once', async () => {
    const coordinator = createChatSegmentCoordinator({
      ttsEnabled: true,
      onRevealSegment: () => {}
    })
    await coordinator.revealFullText('嗨！你是谁呀？')
    expect(mockSession.enqueueAll).toHaveBeenCalledTimes(1)
    expect(mockSession.enqueueAll).toHaveBeenCalledWith([
      { displaySegment: '嗨！', ttsText: '嗨！' },
      { displaySegment: '你是谁呀？', ttsText: '你是谁呀？' }
    ])
    expect(mockSession.enqueue).not.toHaveBeenCalled()
    expect(mockSession.markStreamComplete).toHaveBeenCalledTimes(1)
    expect(mockSession.waitUntilIdle).toHaveBeenCalledTimes(1)
  })
})
