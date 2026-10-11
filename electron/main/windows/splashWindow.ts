import { BrowserWindow, screen, app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

import { logWarn } from '../logging/logger'
import { resolveAppIconPath } from './appIcon'
import { setDeferPetWindowShow, showPetWindowIfNeeded } from './petWindow'

const SPLASH_WIDTH = 400
const SPLASH_HEIGHT = 220
/** 对齐 wait-tts-ready（300s）并留余量；超时仍放出桌宠避免永久卡死 */
const SPLASH_TIMEOUT_MS = 320_000
const TTS_HEALTH_URL = 'http://127.0.0.1:8000/health'
const TTS_POLL_MS = 2_000

let splashWindow: BrowserWindow | null = null
let splashProgress = 0
let splashClosed = false
let splashTimeout: ReturnType<typeof setTimeout> | null = null
let ttsPollTimer: ReturnType<typeof setInterval> | null = null

let petFrameReady = false
let ttsReady = false

function resolveSplashHtmlPath(): string {
  const candidates = [
    join(__dirname, 'splash.html'),
    join(__dirname, 'windows', 'splash.html'),
    join(app.getAppPath(), 'electron', 'main', 'windows', 'splash.html'),
    join(process.cwd(), 'electron', 'main', 'windows', 'splash.html')
  ]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  throw new Error('splash.html not found')
}

function centerSplashBounds(): { x: number; y: number } {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return {
    x: Math.max(0, Math.round((width - SPLASH_WIDTH) / 2)),
    y: Math.max(0, Math.round((height - SPLASH_HEIGHT) / 2))
  }
}

function pushProgressToWindow(percent: number): void {
  const win = splashWindow
  if (!win || win.isDestroyed()) return
  const n = Math.max(0, Math.min(100, Math.round(percent)))
  void win.webContents
    .executeJavaScript(
      `typeof window.setSplashProgress === 'function' && window.setSplashProgress(${n})`
    )
    .catch(() => {
      /* splash 可能已关 */
    })
}

export function setSplashProgress(percent: number): void {
  if (splashClosed) return
  splashProgress = Math.max(splashProgress, Math.max(0, Math.min(100, percent)))
  pushProgressToWindow(splashProgress)
}

function stopTtsPoll(): void {
  if (ttsPollTimer) {
    clearInterval(ttsPollTimer)
    ttsPollTimer = null
  }
}

function tryFinishSplash(): void {
  if (splashClosed) return
  if (!petFrameReady || !ttsReady) return
  setSplashProgress(100)
  setTimeout(() => closeSplashWindow(), 220)
}

async function probeTtsReady(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2_500)
  try {
    // 本地 health 用全局 fetch：net.fetch 对 127.0.0.1 偶发挂起，进度条会停在末段
    const response = await fetch(TTS_HEALTH_URL, {
      method: 'GET',
      signal: controller.signal
    })
    if (!response.ok) return false
    const body = (await response.json()) as { ready?: boolean; engine?: boolean }
    return body.ready === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function startTtsReadyPoll(): void {
  stopTtsPoll()
  const tick = (): void => {
    if (splashClosed || ttsReady) {
      stopTtsPoll()
      return
    }
    void probeTtsReady().then((ok) => {
      if (splashClosed) return
      if (ok) {
        ttsReady = true
        setSplashProgress(petFrameReady ? 95 : 85)
        stopTtsPoll()
        tryFinishSplash()
        return
      }
      // 等 TTS 时让条子慢慢爬，避免看起来卡死（65% 已是渲染进程就绪）
      if (splashProgress >= 65 && splashProgress < 98) {
        setSplashProgress(Math.min(98, splashProgress + 1))
      }
    })
  }
  void tick()
  ttsPollTimer = setInterval(tick, TTS_POLL_MS)
}

/** Live2D 首帧就绪（尚不关窗，等 TTS） */
export function markSplashPetFrameReady(): void {
  if (splashClosed) return
  petFrameReady = true
  setSplashProgress(ttsReady ? 95 : 90)
  tryFinishSplash()
}

export function createSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) return

  splashClosed = false
  splashProgress = 0
  petFrameReady = false
  ttsReady = false
  setDeferPetWindowShow(true)

  const pos = centerSplashBounds()
  const win = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    autoHideMenuBar: true,
    title: '正在加载',
    icon: resolveAppIconPath(),
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  splashWindow = win

  win.once('ready-to-show', () => {
    if (splashClosed || win.isDestroyed()) return
    win.show()
    setSplashProgress(10)
  })

  win.on('closed', () => {
    if (splashWindow === win) splashWindow = null
  })

  void win.loadFile(resolveSplashHtmlPath()).catch((error) => {
    logWarn('splash', 'load splash.html failed', error)
    closeSplashWindow()
  })

  startTtsReadyPoll()

  if (splashTimeout) clearTimeout(splashTimeout)
  splashTimeout = setTimeout(() => {
    logWarn(
      'splash',
      `splash timeout (petFrame=${petFrameReady} tts=${ttsReady}); forcing pet show`
    )
    closeSplashWindow()
  }, SPLASH_TIMEOUT_MS)
}

/** 关加载窗并放出桌宠（可重复调用，幂等） */
export function closeSplashWindow(): void {
  stopTtsPoll()
  if (splashClosed) {
    setDeferPetWindowShow(false)
    showPetWindowIfNeeded()
    return
  }
  splashClosed = true
  setDeferPetWindowShow(false)

  if (splashTimeout) {
    clearTimeout(splashTimeout)
    splashTimeout = null
  }

  const win = splashWindow
  splashWindow = null
  if (win && !win.isDestroyed()) {
    try {
      win.close()
    } catch {
      /* ignore */
    }
  }

  showPetWindowIfNeeded()
}

export function hideSplashWindowForQuit(): void {
  stopTtsPoll()
  if (splashTimeout) {
    clearTimeout(splashTimeout)
    splashTimeout = null
  }
  const win = splashWindow
  splashWindow = null
  splashClosed = true
  setDeferPetWindowShow(false)
  if (win && !win.isDestroyed()) {
    try {
      win.hide()
      win.destroy()
    } catch {
      /* ignore */
    }
  }
}
