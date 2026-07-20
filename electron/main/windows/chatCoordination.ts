import { ipcMain } from 'electron'

import { attachWindowDiagnostics } from '../logging/registerErrorHandlers'
import { closeChatWindow, focusChatWindow, getChatWindow, openChatWindow } from '../chat/window'
import {
  createHomeWindow,
  getHomeWindow,
  notifyHomeVisibility,
  setHomeHiddenForChat
} from './homeWindow'
import { getPetWindow, setPetWindowOverlay } from './petWindow'
import { loadRenderer } from './rendererLoader'

/** 本次文字聊天从哪进入；关闭聊天窗后回到对应界面 */
let chatEntryOrigin: 'home' | 'pet' | null = null

function hideHomeForChat(): void {
  setHomeHiddenForChat(true)
  getHomeWindow()?.hide()
}

function hidePetForChat(): void {
  const petWindow = getPetWindow()
  if (!petWindow || petWindow.isDestroyed()) return
  petWindow.hide()
}

export function prepareWindowsForChat(): void {
  if (chatEntryOrigin === 'pet') {
    hidePetForChat()
    return
  }
  hideHomeForChat()
}

function restorePetAfterChat(): void {
  const petWindow = getPetWindow()
  if (!petWindow || petWindow.isDestroyed()) return
  setPetWindowOverlay(0, 0, false)
  petWindow.show()
  petWindow.setIgnoreMouseEvents(true, { forward: true })
}

function restoreHomeAfterChat(): void {
  setHomeHiddenForChat(false)
  const homeWindow = getHomeWindow()
  if (homeWindow && !homeWindow.isDestroyed()) {
    homeWindow.show()
    homeWindow.focus()
    notifyHomeVisibility(true)
    return
  }
  createHomeWindow()
}

export function restoreWindowsAfterChat(): void {
  const origin = chatEntryOrigin
  chatEntryOrigin = null

  if (origin === 'pet') {
    restorePetAfterChat()
    return
  }

  restoreHomeAfterChat()
}

export function registerChatWindowIpc(): void {
  ipcMain.handle('chat-open-window', (_event, options?: { entryOrigin?: 'home' | 'pet' }) => {
    const existing = getChatWindow()
    if (!existing || existing.isDestroyed()) {
      chatEntryOrigin = options?.entryOrigin ?? 'home'
    }
    const { alreadyOpen } = openChatWindow(loadRenderer)
    if (!alreadyOpen) {
      const win = getChatWindow()
      if (win) attachWindowDiagnostics(win, 'chat')
    }
    return { ok: true as const, alreadyOpen }
  })

  ipcMain.handle('chat-focus-window', () => {
    return { ok: true as const, focused: focusChatWindow() }
  })

  ipcMain.handle('chat-close-window', () => {
    closeChatWindow()
    return { ok: true as const }
  })
}
