import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'

import { attachWindowDiagnostics } from '../logging/registerErrorHandlers'
import { loadRenderer } from './rendererLoader'
import { registerPetNarrateTarget, unregisterPetNarrateTarget } from './petNarrateTarget'

/** 模型加载前的占位尺寸；模型就绪后由渲染进程按实际模型重设 */
export const PET_BOOTSTRAP_WIDTH = 240
export const PET_BOOTSTRAP_HEIGHT = 320

let petWindow: BrowserWindow | null = null
let petWindowWidth = PET_BOOTSTRAP_WIDTH
let petWindowHeight = PET_BOOTSTRAP_HEIGHT
/** 猫娘内容区尺寸（不含菜单 overlay 扩展） */
let petContentWidth = PET_BOOTSTRAP_WIDTH
let petContentHeight = PET_BOOTSTRAP_HEIGHT

export function getPetWindow(): BrowserWindow | null {
  return petWindow
}

export function getPetWindowSize(): { width: number; height: number } {
  return { width: petWindowWidth, height: petWindowHeight }
}

function centerPetWindowBounds(width: number, height: number): { x: number; y: number } {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  return {
    x: Math.max(0, Math.round((screenW - width) / 2)),
    y: Math.max(0, Math.round((screenH - height) / 2))
  }
}

/** 以窗口底边中点为锚点缩放，避免右键菜单/overlay 把桌宠拽回屏幕正中 */
function boundsAnchoredBottomCenter(
  targetWidth: number,
  targetHeight: number
): { x: number; y: number; width: number; height: number } {
  if (!petWindow) {
    return { x: 0, y: 0, width: targetWidth, height: targetHeight }
  }

  const [oldX, oldY] = petWindow.getPosition()
  const anchorX = oldX + petWindowWidth / 2
  const anchorY = oldY + petWindowHeight

  return {
    x: Math.max(0, Math.round(anchorX - targetWidth / 2)),
    y: Math.max(0, Math.round(anchorY - targetHeight)),
    width: targetWidth,
    height: targetHeight
  }
}

export function lockPetWindowSize(width: number, height: number): void {
  petWindowWidth = Math.max(180, Math.round(width))
  petWindowHeight = Math.max(220, Math.round(height))
  petContentWidth = petWindowWidth
  petContentHeight = petWindowHeight

  if (!petWindow) return

  const bounds = boundsAnchoredBottomCenter(petWindowWidth, petWindowHeight)
  petWindow.setMinimumSize(petWindowWidth, petWindowHeight)
  petWindow.setMaximumSize(petWindowWidth, petWindowHeight)
  petWindow.setBounds(bounds)
}

/** 为右键菜单 / 启动遮罩 / 试听弹窗扩展窗口；默认保持桌宠在桌面上的位置 */
export function setPetWindowOverlay(
  overlayWidth: number,
  overlayHeight: number,
  recenter = false
): {
  width: number
  height: number
} {
  if (!petWindow) {
    return { width: petContentWidth, height: petContentHeight }
  }

  const targetWidth =
    overlayWidth > 0 ? Math.max(petContentWidth, Math.round(overlayWidth)) : petContentWidth
  const targetHeight =
    overlayHeight > 0 ? Math.max(petContentHeight, Math.round(overlayHeight)) : petContentHeight

  petWindowWidth = targetWidth
  petWindowHeight = targetHeight

  if (targetWidth === petContentWidth && targetHeight === petContentHeight) {
    lockPetWindowSize(petContentWidth, petContentHeight)
    return { width: petContentWidth, height: petContentHeight }
  }

  const bounds = recenter
    ? { ...centerPetWindowBounds(targetWidth, targetHeight), width: targetWidth, height: targetHeight }
    : boundsAnchoredBottomCenter(targetWidth, targetHeight)

  petWindow.setMinimumSize(petContentWidth, petContentHeight)
  petWindow.setMaximumSize(targetWidth, targetHeight)
  petWindow.setBounds(bounds)

  return { width: targetWidth, height: targetHeight }
}

export function showPetWindowIfNeeded(): void {
  if (!petWindow || petWindow.isVisible()) return
  petWindow.show()
  petWindow.setIgnoreMouseEvents(true, { forward: true })
}

export function setPetWindowAtHome(atHome: boolean): void {
  if (!petWindow) return

  if (atHome) {
    petWindow.hide()
    return
  }

  petWindow.show()
  petWindow.setIgnoreMouseEvents(true, { forward: true })
}

/**
 * 桌宠窗口：透明、无边框、置顶，桌面上只显示 Live2D 模型。
 */
export function createPetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) {
    registerPetNarrateTarget(petWindow.webContents.id)
    return
  }

  const initialPos = centerPetWindowBounds(PET_BOOTSTRAP_WIDTH, PET_BOOTSTRAP_HEIGHT)

  petWindowWidth = PET_BOOTSTRAP_WIDTH
  petWindowHeight = PET_BOOTSTRAP_HEIGHT

  const win = new BrowserWindow({
    width: PET_BOOTSTRAP_WIDTH,
    height: PET_BOOTSTRAP_HEIGHT,
    x: initialPos.x,
    y: initialPos.y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    autoHideMenuBar: true,
    title: '雪澜赛博猫娘',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  petWindow = win
  registerPetNarrateTarget(win.webContents.id)
  lockPetWindowSize(PET_BOOTSTRAP_WIDTH, PET_BOOTSTRAP_HEIGHT)

  win.webContents.on('did-finish-load', () => {
    registerPetNarrateTarget(win.webContents.id)
  })

  win.on('ready-to-show', () => {
    showPetWindowIfNeeded()
  })

  // 任务栏 / 系统关闭桌宠窗：走正规退出（停 llama、收尾），不要只拆掉前端留主进程。
  // Home 点 X 仍是 hide 回桌宠，见 homeWindow.ts。
  win.on('close', (event) => {
    if (!app.isQuitting()) {
      event.preventDefault()
      app.quit()
    }
  })

  win.on('closed', () => {
    unregisterPetNarrateTarget(win.webContents.id)
    if (petWindow === win) petWindow = null
  })

  loadRenderer(win, 'pet')
  attachWindowDiagnostics(win, 'pet')
}

/** 人工验证：等桌宠窗渲染就绪（旁白 IPC 订阅在 PetApp onMounted） */
export function waitForPetWindowReady(timeoutMs = 120_000): Promise<boolean> {
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return Promise.resolve(false)

  const wc = win.webContents
  if (!wc.isLoading()) return Promise.resolve(true)

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      wc.removeListener('did-finish-load', onLoad)
      wc.removeListener('did-fail-load', onFail)
      resolve(ok)
    }
    const onLoad = (): void => finish(true)
    const onFail = (): void => finish(false)
    const timer = setTimeout(() => finish(false), timeoutMs)
    wc.once('did-finish-load', onLoad)
    wc.once('did-fail-load', onFail)
  })
}
