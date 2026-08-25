/**
 * 陪玩旁白 TTS：一路串行合成；切句用陪玩专用规则，不走聊天那套切分。
 */
import { logChatSegmentDebug } from '../chat/chatDebugLog'
import { stripTextForTts } from '../chat/textSplitter'
import { createChatTtsSession } from '../chatTtsSession'
import { splitTextForCompanionTts } from './companionTextSplitter'

/** 陪玩旁白固定串行（parallel_lanes=0）。 */
export function resolveScreenCompanionTtsParallelLanes(): number {
  return 0
}

export async function playScreenCompanionNarrateTts(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return

  const split = splitTextForCompanionTts(trimmed)
  logChatSegmentDebug('陪玩旁白完整文本', trimmed)
  logChatSegmentDebug(
    '陪玩旁白切分汇总',
    split.map((seg, index) => `[${index + 1}] ${seg}`).join('\n') || '(无句段)'
  )

  const ttsSession = createChatTtsSession({
    onRevealSegment: () => {},
    parallelLanes: resolveScreenCompanionTtsParallelLanes()
  })

  const items = split
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((piece, index) => {
      const ttsText = stripTextForTts(piece)
      logChatSegmentDebug(
        `陪玩旁白句段 #${index + 1}`,
        `展示: ${piece}\nTTS: ${ttsText || '(空，跳过合成)'}`
      )
      return { displaySegment: piece, ttsText }
    })

  ttsSession.enqueueAll(items)
  ttsSession.markStreamComplete()
  await ttsSession.waitUntilIdle()
}
