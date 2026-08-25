import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createChatSegmentCoordinator, playChatAssistantReplyTts, resolveChatTtsParallelLanes } from '../chatTtsPipeline'
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

  it('enqueues TTS segments with narrative parentheses stripped for synthesis', async () => {
    const coordinator = createChatSegmentCoordinator({
      ttsEnabled: true,
      onRevealSegment: () => {}
    })
    coordinator.pushDelta('（歪头）你好呀。')
    await coordinator.flush()
    expect(mockSession.enqueue).toHaveBeenCalledWith('（歪头）你好呀。', '你好呀。')
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

  it('forwards ttsParallelLanes=0 by default into createChatTtsSession', () => {
    // chat CONTRACT：未开并行时 parallelLanes 须为 0（串行）
    createChatSegmentCoordinator({
      ttsEnabled: true,
      onRevealSegment: () => {}
    })
    expect(createChatTtsSession).toHaveBeenCalledWith(
      expect.objectContaining({ parallelLanes: 0 })
    )
  })

  it('forwards ttsParallelLanes into createChatTtsSession (pipeline pass-through)', () => {
    // chat CONTRACT：chatTtsPipeline 必须原样转发 ttsParallelLanes → parallelLanes
    createChatSegmentCoordinator({
      ttsEnabled: true,
      ttsParallelLanes: 3,
      onRevealSegment: () => {}
    })
    expect(createChatTtsSession).toHaveBeenCalledWith(
      expect.objectContaining({ parallelLanes: 3 })
    )
  })

  it('does not create TTS session when tts disabled even if lanes set', () => {
    createChatSegmentCoordinator({
      ttsEnabled: false,
      ttsParallelLanes: 4,
      onRevealSegment: () => {}
    })
    expect(createChatTtsSession).not.toHaveBeenCalled()
  })
})

describe('resolveChatTtsParallelLanes', () => {
  it('returns 0 when parallel disabled', () => {
    expect(
      resolveChatTtsParallelLanes({
        ttsEnabled: true,
        ttsParallelEnabled: false,
        ttsParallelLanes: 3
      })
    ).toBe(0)
  })

  it('returns lanes when parallel enabled', () => {
    expect(
      resolveChatTtsParallelLanes({
        ttsEnabled: true,
        ttsParallelEnabled: true,
        ttsParallelLanes: 4
      })
    ).toBe(4)
  })
})

describe('playChatAssistantReplyTts', () => {
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

  it('uses revealFullText pipeline with parallel lanes', async () => {
    await playChatAssistantReplyTts('你好呀。再见！', {
      ttsParallelLanes: resolveChatTtsParallelLanes({
        ttsEnabled: true,
        ttsParallelEnabled: true,
        ttsParallelLanes: 2
      })
    })
    expect(createChatTtsSession).toHaveBeenCalledWith(
      expect.objectContaining({ parallelLanes: 2 })
    )
    expect(mockSession.enqueueAll).toHaveBeenCalled()
    expect(mockSession.waitUntilIdle).toHaveBeenCalled()
  })
})
