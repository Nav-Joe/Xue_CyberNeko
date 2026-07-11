import { logChatSegmentDebug } from './chatDebugLog'
import { createChatTtsSession } from '../chatTtsSession'

import { drainCompleteTtsSegments, splitTextForTts, stripEmojiForTts, stripKaomojiForTts, stripTextForTts, containsKaomoji } from './textSplitter'

export type ChatSegmentCoordinatorOptions = {
  ttsEnabled: boolean
  /** 0=串行；2-4=并行并路 */
  ttsParallelLanes?: number
  /** 每段完整句就绪后追加到 UI（含 emoji / 颜文字） */
  onRevealSegment: (segment: string) => void
}

export type ChatSegmentCoordinator = {
  pushDelta: (delta: string) => void
  flush: () => Promise<void>
  revealFullText: (text: string) => Promise<void>
  reset: () => void
}

/** 流式/整段回复：按句切分；TTS 并发合成、按序播放并与文字同步放出 */
export function createChatSegmentCoordinator(
  options: ChatSegmentCoordinatorOptions
): ChatSegmentCoordinator {
  let segmentBuffer = ''
  let segmentSeq = 0
  let aborted = false
  let fullText = ''
  const ttsParallelLanes = options.ttsParallelLanes ?? 0
  const ttsSession = options.ttsEnabled
    ? createChatTtsSession({
        onRevealSegment: options.onRevealSegment,
        parallelLanes: ttsParallelLanes
      })
    : null

  function revealWithoutTts(displaySegment: string): void {
    if (aborted) return
    options.onRevealSegment(displaySegment)
  }

  function enqueue(displaySegment: string): void {
    if (aborted) return
    const piece = displaySegment.trim()
    if (!piece) return

    segmentSeq += 1
    const ttsText = stripTextForTts(piece)
    logChatSegmentDebug(
      `切分句段 #${segmentSeq}`,
      `展示: ${piece}\nTTS: ${ttsText || '(空，跳过合成)'}`
    )

    if (options.ttsEnabled && ttsSession) {
      ttsSession.enqueue(piece, ttsText)
      return
    }
    revealWithoutTts(piece)
  }

  async function finishTtsSegments(): Promise<void> {
    if (!ttsSession) return
    ttsSession.markStreamComplete()
    await ttsSession.waitUntilIdle()
  }

  return {
    pushDelta(delta: string): void {
      if (!delta) return
      fullText += delta
      const { segments, rest } = drainCompleteTtsSegments(segmentBuffer, delta)
      segmentBuffer = rest
      for (const seg of segments) {
        enqueue(seg)
      }
    },

    async flush(): Promise<void> {
      if (segmentBuffer.trim()) {
        enqueue(segmentBuffer.trim())
        segmentBuffer = ''
      }
      logChatSegmentDebug('流式完整文本', fullText)
      logChatSegmentDebug(
        '流式切分汇总',
        splitTextForTts(fullText)
          .map((seg, index) => `[${index + 1}] ${seg}`)
          .join('\n') || '(无句段)'
      )
      await finishTtsSegments()
    },

    async revealFullText(text: string): Promise<void> {
      fullText = text
      logChatSegmentDebug('LLM 完整回复', text)
      const split = splitTextForTts(text)
      logChatSegmentDebug(
        '完整回复切分汇总',
        split.map((seg, index) => `[${index + 1}] ${seg}`).join('\n') || '(无句段)'
      )

      if (options.ttsEnabled && ttsSession) {
        const items = split
          .map((seg) => seg.trim())
          .filter(Boolean)
          .map((piece) => {
            segmentSeq += 1
            const ttsText = stripTextForTts(piece)
            logChatSegmentDebug(
              `切分句段 #${segmentSeq}`,
              `展示: ${piece}\nTTS: ${ttsText || '(空，跳过合成)'}`
            )
            return { displaySegment: piece, ttsText }
          })
        ttsSession.enqueueAll(items)
        ttsSession.markStreamComplete()
        await ttsSession.waitUntilIdle()
        return
      }

      for (const seg of split) {
        enqueue(seg)
      }
    },

    reset(): void {
      aborted = true
      segmentBuffer = ''
      fullText = ''
      ttsSession?.abort()
    }
  }
}

/** @deprecated 使用 createChatSegmentCoordinator */
export const createChatTtsCoordinator = createChatSegmentCoordinator
