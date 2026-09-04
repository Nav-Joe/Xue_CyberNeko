import { onMounted, onUnmounted, ref } from 'vue'
import { isCompanionChatSendBlocked } from '../services/screenCompanion/companionChatLock'

const CHAT_LOCK_MESSAGE = '猫娘正在看着你打游戏呢~有什么事打完再说吧~'
const CHAT_LOCK_TITLE = '屏幕偷窥'

/** 聊天窗：在玩会话期间拦截发送并弹系统 dialog */
export function useScreenCompanionChatGate() {
  const sessionActive = ref(false)
  const playingGameName = ref<string | null>(null)

  let unsub: (() => void) | null = null

  async function showLockedDialog(): Promise<void> {
    if (window.electronAPI?.showInfoDialog) {
      await window.electronAPI.showInfoDialog({
        title: CHAT_LOCK_TITLE,
        message: CHAT_LOCK_MESSAGE
      })
      return
    }
    window.alert(CHAT_LOCK_MESSAGE)
  }

  function isSendBlocked(): boolean {
    return isCompanionChatSendBlocked(sessionActive.value)
  }

  async function guardSend(action: () => void | Promise<void>): Promise<void> {
    if (!isCompanionChatSendBlocked(sessionActive.value)) {
      await action()
      return
    }
    await showLockedDialog()
  }

  onMounted(() => {
    unsub = window.electronAPI?.screenCompanionOnSession?.((ev) => {
      sessionActive.value = ev.sessionActive
      playingGameName.value = ev.playingGameName
    }) ?? null
    void window.electronAPI?.screenCompanionGetStatus?.().then((res) => {
      if (res.ok) {
        sessionActive.value = res.sessionActive
        playingGameName.value = res.playingGameName
      }
    })
  })

  onUnmounted(() => {
    unsub?.()
    unsub = null
  })

  return {
    sessionActive,
    playingGameName,
    chatLockHint: CHAT_LOCK_MESSAGE,
    isSendBlocked,
    guardSend,
    showLockedDialog
  }
}
