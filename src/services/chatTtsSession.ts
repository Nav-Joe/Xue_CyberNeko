import { logChatTtsDebug, logChatTtsWarn } from './chat/chatDebugLog'
import { abortActiveChatTtsSession, setActiveChatTtsSession } from './chatTtsSessionRegistry'
import { fetchChatTtsBlob, fetchCompanionTtsBlob, playChatAudioBlob } from './ttsPlayer'

/** 相对释放指针最多同时进行的 TTS 推理数（滑动窗口 · 仅串行档） */
export const CHAT_TTS_MAX_BATCH_SIZE = 5

/**
 * 并行档软保险：已合成但未按序释放的 slot 上限 = parallelLanes × 此系数。
 * 写死常量，不进用户配置。
 */
export const CHAT_TTS_READY_BUFFER_LANES_MULTIPLIER = 3

/** 队头未就绪持续超过此时间则周期性 WARN（仅日志，不改调度） */
const HEAD_WAIT_WARN_MS = 5000
const HEAD_WAIT_POLL_MS = 5000

type SegmentSlot = {
  displaySegment: string
  ttsText: string
  /** undefined=推理中或未提交；null=跳过合成；Blob=就绪 */
  blob: Blob | null | undefined
}

function previewTtsText(text: string, max = 24): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max)}…` : t
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

/**
 * 串行：相对释放指针的预取窗（≤ CHAT_TTS_MAX_BATCH_SIZE）。
 * 并行：合成并发按 synthInFlight &lt; lanes；就绪 blob 留 slot；
 * releaseChain 仍按序释放；另有 readyButUnreleased &lt; lanes×3 软保险。
 */
export function createChatTtsSession(options: {
  onRevealSegment: (segment: string) => void
  /** 0=串行；2-4=并行并路（传给后端 parallel_lanes） */
  parallelLanes?: number
  /**
   * 串行档（parallelLanes&lt;2）同时提交的推理上限；默认 CHAT_TTS_MAX_BATCH_SIZE。
   * 陪玩旁白应设为 1，避免多路 HTTP 把 TTS 侧车打满后队头永久卡住。
   */
  serialPrefetchLimit?: number
  /** 单句合成超时（毫秒）；超时按失败跳过该句，避免 waitUntilIdle 永久挂起 */
  synthTimeoutMs?: number
  /** chat=GPU 主引擎；companion=陪玩旁白 CPU 引擎 */
  ttsMode?: 'chat' | 'companion'
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

  const parallelLanes = options.parallelLanes ?? 0
  const isParallelMode = parallelLanes >= 2
  const serialPrefetchLimit = options.serialPrefetchLimit ?? CHAT_TTS_MAX_BATCH_SIZE
  const synthTimeoutMs = options.synthTimeoutMs
  const ttsMode = options.ttsMode ?? 'chat'
  let headWaitSinceMs: number | null = null
  let headWaitTimer: ReturnType<typeof setInterval> | null = null
  let lastHeadWaitWarnAtMs = 0

  function sessionSnapshot(): string {
    return `lanes=${parallelLanes} release=${nextReleaseIndex} pendingSubmit=${pendingSubmitIndex} inFlight=${synthInFlight} segs=${segments.length} readyUnreleased=${readyButUnreleasedCount()}`
  }

  function clearHeadWaitHeartbeat(): void {
    headWaitSinceMs = null
    lastHeadWaitWarnAtMs = 0
    if (headWaitTimer != null) {
      clearInterval(headWaitTimer)
      headWaitTimer = null
    }
  }

  /** 队头卡在未就绪时每 5s 打一条 WARN，便于区分「算得慢」与「真卡死」 */
  function syncHeadWaitHeartbeat(): void {
    if (aborted) {
      clearHeadWaitHeartbeat()
      return
    }
    const head = segments[nextReleaseIndex]
    const waiting = Boolean(head && !isSlotReady(head))
    if (!waiting) {
      clearHeadWaitHeartbeat()
      return
    }
    if (headWaitSinceMs == null) headWaitSinceMs = Date.now()
    if (headWaitTimer != null) return
    headWaitTimer = setInterval(() => {
      if (aborted || headWaitSinceMs == null) {
        clearHeadWaitHeartbeat()
        return
      }
      const headSlot = segments[nextReleaseIndex]
      if (!headSlot || isSlotReady(headSlot)) {
        clearHeadWaitHeartbeat()
        return
      }
      const waitedMs = Date.now() - headWaitSinceMs
      if (waitedMs < HEAD_WAIT_WARN_MS) return
      if (Date.now() - lastHeadWaitWarnAtMs < HEAD_WAIT_POLL_MS) return
      lastHeadWaitWarnAtMs = Date.now()
      logChatTtsWarn('head waiting for blob', `order=${nextReleaseIndex} waitedMs=${waitedMs} ${sessionSnapshot()} preview="${previewTtsText(headSlot.ttsText)}"`)
    }, HEAD_WAIT_POLL_MS)
  }

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
    clearHeadWaitHeartbeat()
    const waiters = idleWaiters
    idleWaiters = []
    for (const resolve of waiters) {
      resolve()
    }
  }

  /** 串行档：已提交尚未释放的窗口大小 */
  function serialInFlightWindowSize(): number {
    return pendingSubmitIndex - nextReleaseIndex
  }

  /** 并行档：已就绪（blob 有值）但尚未按序释放的 slot 数 */
  function readyButUnreleasedCount(): number {
    let count = 0
    for (let i = nextReleaseIndex; i < pendingSubmitIndex; i += 1) {
      if (isSlotReady(segments[i])) count += 1
    }
    return count
  }

  function maxReadyButUnreleased(): number {
    return parallelLanes * CHAT_TTS_READY_BUFFER_LANES_MULTIPLIER
  }

  function canSubmitAnother(): boolean {
    if (isParallelMode) {
      if (synthInFlight >= parallelLanes) return false
      if (readyButUnreleasedCount() >= maxReadyButUnreleased()) return false
      return true
    }
    return serialInFlightWindowSize() < serialPrefetchLimit
  }

  function startSynth(slot: SegmentSlot): void {
    const order = nextSynthOrder
    nextSynthOrder += 1
    synthInFlight += 1
    const startedAt = Date.now()
    logChatTtsDebug(
      'startSynth',
      `order=${order} ${sessionSnapshot()} preview="${previewTtsText(slot.ttsText)}"`
    )
    syncHeadWaitHeartbeat()
    const fetchPromise =
      ttsMode === 'companion'
        ? fetchCompanionTtsBlob(slot.ttsText.trim(), 0, order)
        : fetchChatTtsBlob(slot.ttsText.trim(), 0, order, parallelLanes)
    const raced =
      synthTimeoutMs != null && synthTimeoutMs > 0
        ? Promise.race([
            fetchPromise,
            new Promise<never>((_, reject) => {
              setTimeout(
                () => reject(new Error(`TTS synth timeout after ${synthTimeoutMs}ms`)),
                synthTimeoutMs
              )
            })
          ])
        : fetchPromise
    void raced
      .then((blob) => {
        if (aborted) return
        slot.blob = blob
        logChatTtsDebug(
          'synth ready',
          `order=${order} ms=${Date.now() - startedAt} bytes=${blob.size} ${sessionSnapshot()}`
        )
      })
      .catch((error) => {
        console.error('[TTS] 聊天分段合成失败，请确认语音服务已启动', error)
        if (!aborted) {
          slot.blob = null
          logChatTtsWarn(
            'synth failed',
            `order=${order} ms=${Date.now() - startedAt} ${sessionSnapshot()} err=${error instanceof Error ? error.message : String(error)}`
          )
        }
      })
      .finally(() => {
        synthInFlight -= 1
        // 并行：非队头完成时也要补槽；串行：窗口可能因本句就绪而可再提交
        trySubmitMore()
        scheduleRelease()
        syncHeadWaitHeartbeat()
        notifyMaybeIdle()
      })
  }

  function trySubmitMore(): void {
    while (!aborted && pendingSubmitIndex < segments.length) {
      if (!canSubmitAnother()) break

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
    syncHeadWaitHeartbeat()
    notifyMaybeIdle()
  }

  function scheduleRelease(): void {
    releaseChain = releaseChain.then(async () => {
      if (aborted) return

      const slot = segments[nextReleaseIndex]
      if (!slot || !isSlotReady(slot)) {
        syncHeadWaitHeartbeat()
        return
      }

      const releaseOrder = nextReleaseIndex
      const current = slot
      nextReleaseIndex += 1
      logChatTtsDebug(
        'release',
        `order=${releaseOrder} hasAudio=${Boolean(current.blob)} ${sessionSnapshot()} preview="${previewTtsText(current.displaySegment)}"`
      )
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
      syncHeadWaitHeartbeat()
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
      clearHeadWaitHeartbeat()
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
