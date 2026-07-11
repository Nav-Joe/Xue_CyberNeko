import { ipcMain } from 'electron'

import {
  readChatConfigFile,
  toChatConfigView,
  writeChatConfigFile
} from '../chat/chat-config'
import type { ChatConfigView } from '../../../src/services/chat/types'

export function registerChatConfigIpc(): void {
  // 启动时确保默认配置文件存在
  readChatConfigFile()

  ipcMain.handle('chat-read-config', () => toChatConfigView(readChatConfigFile()))

  ipcMain.handle(
    'chat-write-config',
    (_event, view: ChatConfigView & { apiKey?: string; clearApiKey?: boolean }) => {
      const saved = writeChatConfigFile(JSON.parse(JSON.stringify(view)))
      return toChatConfigView(saved)
    }
  )
}
