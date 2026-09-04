import { logChatSegmentDebug } from './chatDebugLog'
import { createChatTtsSession } from '../chatTtsSession'

import { drainCompleteTtsSegments, splitTextForTts, stripTextForTts } from './textSplitter'
import type { ChatConfigView } from './types'

/**
 * 进入 TTS 推理的句段硬上限（保险）。
 * ≤ 此数：行为与升级前一致；超出部分等前序朗读结束后按原文顺序一次性贴字、不合成。
 */
export const CHAT_TTS_MAX_INFERENCE_SEGMENTS = 50

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

/** 与 useChatSession 一致：关 TTS 或未开并行时返回 0（串行） */
export function resolveChatTtsParallelLanes(
  config: Pick<ChatConfigView, 'ttsEnabled' | 'ttsParallelEnabled' | 'ttsParallelLanes'>
): number {
  const ttsEnabled = config.ttsEnabled !== false
  return ttsEnabled && config.ttsParallelEnabled ? config.ttsParallelLanes : 0
}

/**
 * 整段助手文案 TTS（聊天回复）：splitTextForTts 切句 + chatTtsSession 串并行推理。
 * onRevealSegment 为空实现时不写 UI，仍按序播放并对 Live2D 口型。
 */
export async function playChatAssistantReplyTts(
  text: string,
  options: { ttsParallelLanes: number }
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return

  const coordinator = createChatSegmentCoordinator({
    ttsEnabled: true,
    ttsParallelLanes: options.ttsParallelLanes,
    onRevealSegment: () => {}
  })
  await coordinator.revealFullText(trimmed)
}

/** 流式/整段回复：按句切分；TTS 并发合成、按序播放并与文字同步放出 */
export function createChatSegmentCoordinator(
  options: ChatSegmentCoordinatorOptions
): ChatSegmentCoordinator {
  let segmentBuffer = ''
  let segmentSeq = 0
  let ttsInferenceCount = 0
  /** 超过推理上限的展示句，保持切分顺序，朗读结束后一次性拼接贴出 */
  let overflowParts: string[] = []
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

  function revealOverflowAfterTts(): void {
    if (aborted || overflowParts.length === 0) return
    const rest = overflowParts.join('')
    overflowParts = []
    if (!rest) return
    logChatSegmentDebug(
      `TTS 推理上限外剩余正文（一次性贴出，上限=${CHAT_TTS_MAX_INFERENCE_SEGMENTS}）`,
      rest
    )
    options.onRevealSegment(rest)
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
      if (ttsInferenceCount >= CHAT_TTS_MAX_INFERENCE_SEGMENTS) {
        overflowParts.push(piece)
        return
      }
      ttsInferenceCount += 1
      ttsSession.enqueue(piece, ttsText)
      return
    }
    revealWithoutTts(piece)
  }

  async function finishTtsSegments(): Promise<void> {
    if (!ttsSession) return
    ttsSession.markStreamComplete()
    await ttsSession.waitUntilIdle()
    revealOverflowAfterTts()
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
        const forTts = items.slice(0, CHAT_TTS_MAX_INFERENCE_SEGMENTS)
        const overflow = items.slice(CHAT_TTS_MAX_INFERENCE_SEGMENTS)
        ttsInferenceCount = forTts.length
        if (overflow.length > 0) {
          overflowParts = overflow.map((item) => item.displaySegment)
        }
        ttsSession.enqueueAll(forTts)
        ttsSession.markStreamComplete()
        await ttsSession.waitUntilIdle()
        revealOverflowAfterTts()
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
      ttsInferenceCount = 0
      overflowParts = []
      ttsSession?.abort()
    }
  }
}

/** @deprecated 使用 createChatSegmentCoordinator */
export const createChatTtsCoordinator = createChatSegmentCoordinator
