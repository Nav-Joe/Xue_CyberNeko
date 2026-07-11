import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAT_TTS_MAX_BATCH_SIZE, createChatTtsSession } from '../chatTtsSession'
import { fetchChatTtsBlob, playChatAudioBlob } from '../ttsPlayer'

vi.mock('../ttsPlayer', () => ({
  fetchChatTtsBlob: vi.fn(),
  fetchChatTtsBatch: vi.fn(),
  playChatAudioBlob: vi.fn()
}))

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe('createChatTtsSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchChatTtsBlob).mockImplementation(async (text) => new Blob([`audio:${text}`]))
    vi.mocked(playChatAudioBlob).mockResolvedValue(undefined)
  })

  it('enqueueAll submits up to five synth jobs after all segments are registered', async () => {
    const gates = new Map<string, () => void>()
    vi.mocked(fetchChatTtsBlob).mockImplementation(
      (text) =>
        new Promise((resolve) => {
          gates.set(text, () => resolve(new Blob([text])))
        })
    )

    const session = createChatTtsSession({ onRevealSegment: () => {} })
    session.enqueueAll([
      { displaySegment: 'seg-1', ttsText: 'seg-1' },
      { displaySegment: 'seg-2', ttsText: 'seg-2' },
      { displaySegment: 'seg-3', ttsText: 'seg-3' },
      { displaySegment: 'seg-4', ttsText: 'seg-4' },
      { displaySegment: 'seg-5', ttsText: 'seg-5' },
      { displaySegment: 'seg-6', ttsText: 'seg-6' }
    ])
    session.markStreamComplete()
    await delay(10)

    expect(fetchChatTtsBlob).toHaveBeenCalledTimes(5)
    expect(gates.has('seg-6')).toBe(false)
  })

  it('streaming enqueue fills the window as segments arrive', async () => {
    const gates = new Map<string, () => void>()
    vi.mocked(fetchChatTtsBlob).mockImplementation(
      (text) =>
        new Promise((resolve) => {
          gates.set(text, () => resolve(new Blob([`audio:${text}`])))
        })
    )

    const session = createChatTtsSession({ onRevealSegment: () => {} })
    for (let i = 1; i <= 6; i += 1) {
      session.enqueue(`seg-${i}`, `seg-${i}`)
    }
    session.markStreamComplete()
    await delay(20)

    expect(fetchChatTtsBlob).toHaveBeenCalledTimes(5)
    expect([...gates.keys()]).toEqual(['seg-1', 'seg-2', 'seg-3', 'seg-4', 'seg-5'])

    for (let i = 1; i <= 6; i += 1) {
      gates.get(`seg-${i}`)?.()
      await delay(5)
    }
    await session.waitUntilIdle()

    expect(fetchChatTtsBlob).toHaveBeenCalledTimes(6)
    expect(fetchChatTtsBlob).toHaveBeenCalledWith('seg-6', 0, 5, 0)
  })

  it('releases in queue order even when later segments finish first', async () => {
    const gates = new Map<string, () => void>()
    vi.mocked(fetchChatTtsBlob).mockImplementation(
      (text) =>
        new Promise((resolve) => {
          gates.set(text, () => resolve(new Blob([text])))
        })
    )

    const timeline: string[] = []
    vi.mocked(playChatAudioBlob).mockImplementation(async (blob) => {
      timeline.push(`play:${await blob.text()}`)
    })

    const session = createChatTtsSession({
      onRevealSegment: (seg) => timeline.push(`reveal:${seg}`)
    })

    session.enqueue('a', 'a')
    session.enqueue('b', 'b')
    session.enqueue('c', 'c')
    session.markStreamComplete()
    await delay(10)

    gates.get('c')?.()
    await delay(10)
    expect(timeline).not.toContain('reveal:c')

    gates.get('a')?.()
    await vi.waitFor(() => {
      expect(timeline).toContain('reveal:a')
    })

    gates.get('b')?.()
    await session.waitUntilIdle()

    expect(timeline.filter((e) => e.startsWith('reveal:'))).toEqual(['reveal:a', 'reveal:b', 'reveal:c'])
    expect(timeline.filter((e) => e.startsWith('play:'))).toEqual(['play:a', 'play:b', 'play:c'])
  })

  it('submits the sixth segment only after the first is released', async () => {
    const gates = new Map<string, () => void>()
    vi.mocked(fetchChatTtsBlob).mockImplementation(
      (text) =>
        new Promise((resolve) => {
          gates.set(text, () => resolve(new Blob([text])))
        })
    )

    const session = createChatTtsSession({ onRevealSegment: () => {} })
    for (let i = 1; i <= 6; i += 1) {
      session.enqueue(`seg-${i}`, `seg-${i}`)
    }
    session.markStreamComplete()
    await delay(10)

    expect(fetchChatTtsBlob).toHaveBeenCalledTimes(5)
    expect(gates.has('seg-6')).toBe(false)

    gates.get('seg-1')?.()
    await vi.waitFor(() => {
      expect(fetchChatTtsBlob).toHaveBeenCalledTimes(6)
    })
    expect(fetchChatTtsBlob).toHaveBeenCalledWith('seg-6', 0, 5, 0)

    for (let i = 2; i <= 6; i += 1) {
      gates.get(`seg-${i}`)?.()
    }
    await session.waitUntilIdle()
  })

  it('reveals emoji-only segments without fetch', async () => {
    const revealed: string[] = []
    const session = createChatTtsSession({
      onRevealSegment: (seg) => revealed.push(seg)
    })

    session.enqueue('😊', '')
    session.markStreamComplete()
    await session.waitUntilIdle()

    expect(revealed).toEqual(['😊'])
    expect(fetchChatTtsBlob).not.toHaveBeenCalled()
    expect(playChatAudioBlob).not.toHaveBeenCalled()
  })

  it('releases each segment as soon as it is ready at the queue head', async () => {
    const gates = new Map<string, () => void>()
    vi.mocked(fetchChatTtsBlob).mockImplementation(
      (text) =>
        new Promise((resolve) => {
          gates.set(text, () => resolve(new Blob([text])))
        })
    )

    const timeline: string[] = []
    const session = createChatTtsSession({
      onRevealSegment: (seg) => timeline.push(`reveal:${seg}`)
    })

    session.enqueueAll([
      { displaySegment: 'seg-1', ttsText: 'seg-1' },
      { displaySegment: 'seg-2', ttsText: 'seg-2' },
      { displaySegment: 'seg-3', ttsText: 'seg-3' }
    ])
    session.markStreamComplete()
    await delay(10)

    gates.get('seg-3')?.()
    await delay(10)
    expect(timeline).toEqual([])

    gates.get('seg-1')?.()
    await vi.waitFor(() => {
      expect(timeline).toEqual(['reveal:seg-1'])
    })

    gates.get('seg-2')?.()
    await session.waitUntilIdle()
    expect(timeline).toEqual(['reveal:seg-1', 'reveal:seg-2', 'reveal:seg-3'])
  })

  it('parallel mode refills window on release (4 segs, lanes=2)', async () => {
    const gates = new Map<string, () => void>()
    vi.mocked(fetchChatTtsBlob).mockImplementation(
      (text) =>
        new Promise((resolve) => {
          gates.set(text, () => resolve(new Blob([text])))
        })
    )

    const session = createChatTtsSession({
      onRevealSegment: () => {},
      parallelLanes: 2
    })

    session.enqueueAll([
      { displaySegment: 'seg-1', ttsText: 'seg-1' },
      { displaySegment: 'seg-2', ttsText: 'seg-2' },
      { displaySegment: 'seg-3', ttsText: 'seg-3' },
      { displaySegment: 'seg-4', ttsText: 'seg-4' }
    ])
    session.markStreamComplete()
    await delay(10)

    expect(fetchChatTtsBlob).toHaveBeenCalledTimes(2)
    expect(gates.has('seg-3')).toBe(false)
    expect(gates.has('seg-4')).toBe(false)

    gates.get('seg-1')?.()
    await vi.waitFor(() => {
      expect(fetchChatTtsBlob).toHaveBeenCalledTimes(3)
    })
    expect(fetchChatTtsBlob).toHaveBeenCalledWith('seg-3', 0, 2, 2)

    gates.get('seg-2')?.()
    await vi.waitFor(() => {
      expect(fetchChatTtsBlob).toHaveBeenCalledTimes(4)
    })
    expect(fetchChatTtsBlob).toHaveBeenCalledWith('seg-4', 0, 3, 2)

    gates.get('seg-3')?.()
    gates.get('seg-4')?.()
    await session.waitUntilIdle()
  })

  it('passes parallel lanes to fetch when configured', async () => {
    const session = createChatTtsSession({
      onRevealSegment: () => {},
      parallelLanes: 3
    })

    session.enqueue('hello', 'hello')
    session.markStreamComplete()
    await session.waitUntilIdle()

    expect(fetchChatTtsBlob).toHaveBeenCalledWith('hello', 0, 0, 3)
  })

  it('exports max batch size constant', () => {
    expect(CHAT_TTS_MAX_BATCH_SIZE).toBe(5)
  })
})
