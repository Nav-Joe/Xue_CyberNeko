import { abortActiveChatTtsSession, setActiveChatTtsSession } from './chatTtsSessionRegistry'
import { fetchChatTtsBlob, playChatAudioBlob } from './ttsPlayer'

/** 相对释放指针最多同时进行的 TTS 推理数（滑动窗口） */
export const CHAT_TTS_MAX_BATCH_SIZE = 5

type SegmentSlot = {
  displaySegment: string
  ttsText: string
  /** undefined=推理中或未提交；null=跳过合成；Blob=就绪 */
  blob: Blob | null | undefined
}

export type ChatTtsSession = {
  enqueue: (displaySegment: string, ttsText: string) => number
  /** 非流式：先登记全部句段，再统一按滑动窗口提交推理（无首句优先） */
  enqueueAll: (items: Array<{ displaySegment: string; ttsText: string }>) => void
  markStreamComplete: () => void
  waitUntilIdle: () => Promise<void>
  abort: () => void
}

export { abortActiveChatTtsSession } from './chatTtsSessionRegistry'

function isSlotReady(slot: SegmentSlot): boolean {
  return slot.blob !== undefined
}

/** @deprecated 使用 CHAT_TTS_MAX_BATCH_SIZE */
export const CHAT_TTS_MAX_SYNTH_CONCURRENCY = CHAT_TTS_MAX_BATCH_SIZE

/** 滑动窗口：串行预取最多 CHAT_TTS_MAX_BATCH_SIZE；并行时在飞数 = parallelLanes，队头释放后立即补下一句 */
export function createChatTtsSession(options: {
  onRevealSegment: (segment: string) => void
  /** 0=串行；2-4=并行并路（传给后端 parallel_lanes） */
  parallelLanes?: number
}): ChatTtsSession {
  abortActiveChatTtsSession()

  const segments: SegmentSlot[] = []
  let nextReleaseIndex = 0
  let pendingSubmitIndex = 0
  let streamComplete = false
  let aborted = false
  let synthInFlight = 0
  let nextSynthOrder = 0
  let releaseChain: Promise<void> = Promise.resolve()
  let idleWaiters: Array<() => void> = []

  function isIdle(): boolean {
    return (
      streamComplete &&
      pendingSubmitIndex >= segments.length &&
      nextReleaseIndex >= segments.length &&
      synthInFlight === 0
    )
  }

  function notifyMaybeIdle(): void {
    if (!isIdle()) return
    const waiters = idleWaiters
    idleWaiters = []
    for (const resolve of waiters) {
      resolve()
    }
  }

  function inFlightWindowSize(): number {
    return pendingSubmitIndex - nextReleaseIndex
  }

  /** 并行模式：在飞数 = 并路数；串行模式：沿用较大预取窗口 */
  function maxInFlightWindow(): number {
    return parallelLanes >= 2 ? parallelLanes : CHAT_TTS_MAX_BATCH_SIZE
  }

  const parallelLanes = options.parallelLanes ?? 0

  function startSynth(slot: SegmentSlot): void {
    const order = nextSynthOrder
    nextSynthOrder += 1
    synthInFlight += 1
    void fetchChatTtsBlob(slot.ttsText.trim(), 0, order, parallelLanes)
      .then((blob) => {
        if (!aborted) slot.blob = blob
      })
      .catch((error) => {
        console.error('[TTS] 聊天分段合成失败，请确认语音服务已启动', error)
        if (!aborted) slot.blob = null
      })
      .finally(() => {
        synthInFlight -= 1
        scheduleRelease()
        notifyMaybeIdle()
      })
  }

  function trySubmitMore(): void {
    while (!aborted && pendingSubmitIndex < segments.length) {
      if (inFlightWindowSize() >= maxInFlightWindow()) break

      const slot = segments[pendingSubmitIndex]
      pendingSubmitIndex += 1

      if (!slot.ttsText.trim()) {
        slot.blob = null
        scheduleRelease()
        continue
      }

      slot.blob = undefined
      startSynth(slot)
    }
    notifyMaybeIdle()
  }

  function scheduleRelease(): void {
    releaseChain = releaseChain.then(async () => {
      if (aborted) return

      const slot = segments[nextReleaseIndex]
      if (!slot || !isSlotReady(slot)) return

      const current = slot
      nextReleaseIndex += 1
      trySubmitMore()

      options.onRevealSegment(current.displaySegment)
      if (current.blob) {
        try {
          await playChatAudioBlob(current.blob)
        } catch (error) {
          console.error('[TTS] 聊天分段播放失败', error)
        }
      }

      if (!aborted && segments[nextReleaseIndex] && isSlotReady(segments[nextReleaseIndex])) {
        scheduleRelease()
      }
      notifyMaybeIdle()
    })
  }

  const session: ChatTtsSession = {
    enqueue(displaySegment: string, ttsText: string): number {
      if (aborted) return -1
      const index = segments.length
      segments.push({
        displaySegment,
        ttsText,
        blob: undefined
      })

      trySubmitMore()
      scheduleRelease()
      return index
    },

    enqueueAll(items: Array<{ displaySegment: string; ttsText: string }>): void {
      if (aborted || items.length === 0) return
      for (const item of items) {
        segments.push({
          displaySegment: item.displaySegment,
          ttsText: item.ttsText,
          blob: undefined
        })
      }
      trySubmitMore()
      scheduleRelease()
    },

    markStreamComplete(): void {
      streamComplete = true
      trySubmitMore()
      scheduleRelease()
      notifyMaybeIdle()
    },

    async waitUntilIdle(): Promise<void> {
      await releaseChain
      if (isIdle()) return
      await new Promise<void>((resolve) => {
        idleWaiters.push(resolve)
      })
      await session.waitUntilIdle()
    },

    abort(): void {
      aborted = true
      segments.length = 0
      nextReleaseIndex = 0
      pendingSubmitIndex = 0
      streamComplete = false
      synthInFlight = 0
      nextSynthOrder = 0
      releaseChain = Promise.resolve()
      idleWaiters = []
      setActiveChatTtsSession(null)
    }
  }

  setActiveChatTtsSession(session)
  return session
}
