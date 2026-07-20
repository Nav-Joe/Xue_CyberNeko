import { BrowserWindow } from 'electron'
import { join } from 'path'

import { attachWindowDiagnostics } from '../logging/registerErrorHandlers'
import { getPetWindow, setPetWindowAtHome } from './petWindow'
import { loadRenderer } from './rendererLoader'

let homeWindow: BrowserWindow | null = null
/** 为文字聊天临时隐藏 Home，避免触发「回家隐藏桌宠」的 hide 逻辑 */
let homeHiddenForChat = false
let isQuitting = false

export function getHomeWindow(): BrowserWindow | null {
  return homeWindow
}

export function setHomeHiddenForChat(hidden: boolean): void {
  homeHiddenForChat = hidden
}

/** 与原先 index 模块级 `let isQuitting` 同模式：直接赋值，非 store */
export function setQuitting(value: boolean): void {
  isQuitting = value
}

export function notifyHomeVisibility(visible: boolean): void {
  setPetWindowAtHome(visible)
  getPetWindow()?.webContents.send('home-visibility-changed', visible)
}

function bindHomeWindowEvents(win: BrowserWindow): void {
  win.on('show', () => {
    if (!homeHiddenForChat) {
      notifyHomeVisibility(true)
    }
  })

  win.on('hide', () => {
    if (!homeHiddenForChat) {
      notifyHomeVisibility(false)
    }
  })

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  win.on('closed', () => {
    homeWindow = null
    notifyHomeVisibility(false)
  })
}

/**
 * 「家」窗口：普通窗口，用于聊天、设置、背景等（默认隐藏）。
 */
export function createHomeWindow(): void {
  if (homeWindow) {
    homeWindow.show()
    homeWindow.focus()
    return
  }

  homeWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: '雪澜的家',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  bindHomeWindowEvents(homeWindow)

  homeWindow.on('ready-to-show', () => {
    homeWindow?.show()
    homeWindow?.focus()
  })

  loadRenderer(homeWindow, 'home')
  attachWindowDiagnostics(homeWindow, 'home')
}
