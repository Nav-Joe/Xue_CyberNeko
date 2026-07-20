import { loadChatConfigView } from '../../services/chat/chatConfigStore'
import type { ChatEntryOrigin } from '../../services/chat/types'

import { useChatLlamaBootstrap } from './useChatLlamaBootstrap'

export type { ChatEntryOrigin }

export function useChatEntry() {
  const { chatBooting, bootTitle, bootMessage, bootProgress, canCancelDownload, cancellingDownload, cancelDownload, ensureLocalLlamaReady } =
    useChatLlamaBootstrap()

  async function openChat(options?: { origin?: ChatEntryOrigin }): Promise<void> {
    if (chatBooting.value) return

    const origin = options?.origin ?? 'home'

    const focused = await window.electronAPI?.focusChatWindow?.()
    if (focused?.focused) return

    let chatConfig: Awaited<ReturnType<typeof loadChatConfigView>> | null = null
    try {
      chatConfig = await loadChatConfigView()
    } catch {
      chatConfig = null
    }

    if (chatConfig?.llmMode === 'openai_api') {
      await window.electronAPI.openChatWindow({ entryOrigin: origin })
      return
    }

    const ready = await ensureLocalLlamaReady()
    if (!ready) return

    await window.electronAPI.openChatWindow({ entryOrigin: origin })
  }

  return {
    chatBooting,
    bootTitle,
    bootMessage,
    bootProgress,
    canCancelDownload,
    cancellingDownload,
    cancelDownload,
    openChat
  }
}
