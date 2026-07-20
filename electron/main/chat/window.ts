import { BrowserWindow, type BrowserWindow as BrowserWindowType } from 'electron'
import { join } from 'path'

import { onChatWindowClosed } from '../llama/downloadLifecycle'

let chatWindow: BrowserWindowType | null = null

type LoadRenderer = (win: BrowserWindowType, hash?: string) => void

export type ChatWindowLifecycle = {
  onOpened: () => void
  onClosed: () => void
}

let lifecycle: ChatWindowLifecycle | null = null

export function setChatWindowLifecycle(hooks: ChatWindowLifecycle | null): void {
  lifecycle = hooks
}

export function getChatWindow(): BrowserWindowType | null {
  return chatWindow
}

export function openChatWindow(loadRenderer: LoadRenderer): { alreadyOpen: boolean } {
  if (chatWindow && !chatWindow.isDestroyed()) {
    lifecycle?.onOpened()
    chatWindow.show()
    chatWindow.focus()
    return { alreadyOpen: true }
  }

  chatWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: '文字聊天 · 雪澜',
    backgroundColor: '#fdf2f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  chatWindow.on('ready-to-show', () => {
    lifecycle?.onOpened()
    chatWindow?.show()
    chatWindow?.focus()
  })

  chatWindow.on('closed', () => {
    chatWindow = null
    lifecycle?.onClosed()
    // 点 X 时若正在下载：abort + 清半成品 + 停 llama，避免下次下载卡死
    void onChatWindowClosed()
  })

  loadRenderer(chatWindow, 'chat')
  return { alreadyOpen: false }
}

export function focusChatWindow(): boolean {
  if (!chatWindow || chatWindow.isDestroyed()) return false
  chatWindow.show()
  chatWindow.focus()
  return true
}

export function closeChatWindow(): void {
  if (!chatWindow || chatWindow.isDestroyed()) return
  chatWindow.close()
}
