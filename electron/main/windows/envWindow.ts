import { BrowserWindow } from 'electron'
import { join } from 'path'

import { attachWindowDiagnostics } from '../logging/registerErrorHandlers'
import { resolveAppIconPath } from './appIcon'
import { loadRenderer } from './rendererLoader'

let envWindow: BrowserWindow | null = null

/** 环境页：尺寸对齐文字聊天窗，不挡住桌宠。 */
export function openEnvWindow(): { alreadyOpen: boolean } {
  if (envWindow && !envWindow.isDestroyed()) {
    envWindow.show()
    envWindow.focus()
    return { alreadyOpen: true }
  }

  envWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: '环境 · 雪澜',
    icon: resolveAppIconPath(),
    backgroundColor: '#fdf2f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  envWindow.on('ready-to-show', () => {
    envWindow?.show()
    envWindow?.focus()
  })

  envWindow.on('closed', () => {
    envWindow = null
  })

  attachWindowDiagnostics(envWindow, 'env')
  loadRenderer(envWindow, 'env')
  return { alreadyOpen: false }
}
