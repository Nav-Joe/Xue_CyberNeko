/**
 * 陪玩旁白 TTS：一路串行合成；切句用陪玩专用规则，不走聊天那套切分。
 */
import { logChatSegmentDebug } from '../chat/chatDebugLog'
import { stripTextForTts } from '../chat/textSplitter'
import { createChatTtsSession } from '../chatTtsSession'
import { loadScreenCompanionConfig } from './screenCompanionStore'
import type { CompanionTtsDevice } from './types'
import { splitTextForCompanionTts } from './companionTextSplitter'

/** 陪玩旁白：逐句提交推理，避免 5 路预取把 TTS 侧车打满。 */
export const COMPANION_TTS_SERIAL_PREFETCH_LIMIT = 1

/** 单句旁白合成超时（毫秒）；卡住则跳过该句，防止整轮旁白永久挂起。 */
export const COMPANION_TTS_SYNTH_TIMEOUT_MS = 120_000

export function resolveScreenCompanionTtsParallelLanes(): number {
  return 0
}

/** cpu → 陪玩专用 CPU 引擎；gpu → 复用对话 GPU 主引擎。 */
export function resolveCompanionTtsMode(device: CompanionTtsDevice): 'companion' | 'chat' {
  return device === 'gpu' ? 'chat' : 'companion'
}

export async function resolveCompanionTtsDeviceFromConfig(): Promise<CompanionTtsDevice> {
  try {
    const config = await loadScreenCompanionConfig()
    return config.companionTtsDevice === 'gpu' ? 'gpu' : 'cpu'
  } catch {
    return 'cpu'
  }
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

  const companionTtsDevice = await resolveCompanionTtsDeviceFromConfig()
  const ttsMode = resolveCompanionTtsMode(companionTtsDevice)
  logChatSegmentDebug('陪玩旁白 TTS 设备', companionTtsDevice)

  const ttsSession = createChatTtsSession({
    onRevealSegment: () => {},
    parallelLanes: resolveScreenCompanionTtsParallelLanes(),
    serialPrefetchLimit: COMPANION_TTS_SERIAL_PREFETCH_LIMIT,
    synthTimeoutMs: COMPANION_TTS_SYNTH_TIMEOUT_MS,
    ttsMode
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
