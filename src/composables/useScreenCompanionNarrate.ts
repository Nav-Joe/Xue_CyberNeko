import { onMounted, onUnmounted } from 'vue'

import { playScreenCompanionNarrateTts } from '../services/screenCompanion/companionTtsPipeline'
import type { ScreenCompanionNarrateEvent } from '../services/screenCompanion/types'
import { abortActiveChatTtsSession } from '../services/chatTtsSessionRegistry'
import { stopSpeaking } from '../services/ttsPlayer'

type NarratePayload = ScreenCompanionNarrateEvent

/** 桌宠窗：收到看屏旁白后，按陪玩规则切句并一路串行播放 TTS。 */
export function useScreenCompanionNarrate(): void {
  let unsubNarrate: (() => void) | null = null
  let narrateChain: Promise<void> = Promise.resolve()
  let inFlightTs: number | null = null

  async function notifyNarrateDone(ts: number, ok: boolean): Promise<void> {
    try {
      await window.electronAPI?.screenCompanionNotifyNarrateDone?.({ ts, ok })
    } catch {
      /* ignore */
    }
  }

  async function cancelInFlightNarrate(): Promise<void> {
    if (inFlightTs == null) return
    const prevTs = inFlightTs
    inFlightTs = null
    stopSpeaking()
    abortActiveChatTtsSession()
    await notifyNarrateDone(prevTs, false)
  }

  async function handleNarrate(payload: NarratePayload): Promise<void> {
    if (inFlightTs != null && inFlightTs !== payload.ts) {
      await cancelInFlightNarrate()
    }

    inFlightTs = payload.ts
    let ok = false
    try {
      stopSpeaking()
      await playScreenCompanionNarrateTts(payload.text)
      ok = true
    } catch (error) {
      console.warn('[screenCompanion] narrate TTS failed', error)
    } finally {
      if (inFlightTs === payload.ts) {
        inFlightTs = null
        await notifyNarrateDone(payload.ts, ok)
      }
    }
  }

  onMounted(() => {
    if (!window.electronAPI?.screenCompanionOnNarrate) return
    unsubNarrate = window.electronAPI.screenCompanionOnNarrate((payload) => {
      narrateChain = narrateChain
        .then(() => handleNarrate(payload))
        .catch((error) => {
          console.warn('[screenCompanion] narrate chain failed', error)
        })
    })
  })

  onUnmounted(() => {
    unsubNarrate?.()
    unsubNarrate = null
    void cancelInFlightNarrate()
  })
}
