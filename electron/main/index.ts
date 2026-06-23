import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import { readFileSync } from 'fs'
import { createRequire } from 'node:module'
import { basename, join } from 'path'

import { readTouchConfig, readVoiceForgeConfig, reconcileVoiceRuntimeConfig, prepareVoiceCreation, prepareVoiceUpload, requestVoiceModelRegeneration, listVoiceSamples, switchVoiceSample, deleteVoiceSample, cancelVoiceForgeReview, applyCorpusPrewarm, applyAltEngineCorpus, disableAltEngineCorpus, setOfficialTouchPlayback, setRealtimeTouchInference, readRealtimeInferenceFlag, isOfficialTouchCacheReady, writeTouchConfig, writeVoiceForgeConfig, readSampleCorpus, readExperimentalVoiceUploadEnabled, writeExperimentalVoiceUploadEnabled, resetExperimentalFeaturesOnStartup, type TouchFeedbackMode } from './runtimeConfig'
import { DEFAULT_LIVE2D_MODEL_WEB_PATH, resolveLive2DModelWebPath } from './live2dModel'
import { readTtsEngineCapabilities } from './ttsEngineInfo'
import type { CorpusData } from '../../src/types/corpus'

const require = createRequire(import.meta.url)
const appInstanceLock = require(join(__dirname, '../../scripts/app-instance-lock.js')) as {
  writeLock: (pid: number, role?: string) => void
  clearLock: (expectedPid?: number) => void
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (petWindow) {
      if (petWindow.isMinimized()) {
        petWindow.restore()
      }
      petWindow.show()
      petWindow.focus()
    }
  })
}

/** 模型加载前的占位尺寸；模型就绪后由渲染进程按实际模型重设 */
const PET_BOOTSTRAP_WIDTH = 240
const PET_BOOTSTRAP_HEIGHT = 320

let petWindow: BrowserWindow | null = null
let homeWindow: BrowserWindow | null = null
let pendingVoiceUploadPath: string | null = null
let isQuitting = false
let petWindowWidth = PET_BOOTSTRAP_WIDTH
let petWindowHeight = PET_BOOTSTRAP_HEIGHT
/** 猫娘内容区尺寸（不含菜单 overlay 扩展） */
let petContentWidth = PET_BOOTSTRAP_WIDTH
let petContentHeight = PET_BOOTSTRAP_HEIGHT

function getRendererUrl(hash = ''): string {
  const base = process.env['ELECTRON_RENDERER_URL']
  if (base) {
    return hash ? `${base}#${hash}` : base
  }
  return join(__dirname, '../renderer/index.html')
}

function loadRenderer(win: BrowserWindow, hash = ''): void {
  const url = getRendererUrl(hash)
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(url)
  } else {
    if (hash) {
      void win.loadFile(url, { hash })
    } else {
      void win.loadFile(url)
    }
  }
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

function lockPetWindowSize(width: number, height: number): void {
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
function setPetWindowOverlay(
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

function broadcastVoiceSamplesChanged(): void {
  homeWindow?.webContents.send('voice-samples-changed')
  petWindow?.webContents.send('voice-samples-changed')
}

const ENGINE_LOAD_OVERLAY_WIDTH = 360
const ENGINE_LOAD_OVERLAY_HEIGHT = 260

let pendingVoiceEngineLoadResolve: ((result: { ok: boolean }) => void) | null = null

function showPetForEngineLoad(): void {
  if (homeWindow?.isVisible()) {
    homeWindow.hide()
  }
  notifyHomeVisibility(false)

  if (!petWindow) {
    return
  }

  setPetWindowOverlay(ENGINE_LOAD_OVERLAY_WIDTH, ENGINE_LOAD_OVERLAY_HEIGHT, true)
  showPetWindowIfNeeded()
}

async function completeVoiceSwitchOnPet(payload: {
  touchMode: 'curated' | 'custom_corpus'
  loadMode?: 'curated' | 'engine' | 'prewarm' | 'realtime'
  prewarm?: boolean
}): Promise<void> {
  showPetForEngineLoad()
  if (!petWindow) {
    return
  }
  petWindow.webContents.send('voice-config-changed', payload)
}

async function beginVoiceEngineLoadOnPet(payload: {
  title: string
  message: string
  mode: 'curated' | 'engine' | 'prewarm' | 'realtime'
  sync?: boolean
  expectedTouchMode?: 'curated' | 'custom_corpus'
  syncMessage?: string
}): Promise<{ ok: boolean }> {
  showPetForEngineLoad()
  if (!petWindow) {
    return { ok: false }
  }

  pendingVoiceEngineLoadResolve?.({ ok: false })
  pendingVoiceEngineLoadResolve = null

  return new Promise((resolve) => {
    pendingVoiceEngineLoadResolve = resolve
    petWindow!.webContents.send('voice-engine-load-begin', payload)
  })
}

function showPetWindowIfNeeded(): void {
  if (!petWindow || petWindow.isVisible()) return
  petWindow.show()
  petWindow.setIgnoreMouseEvents(true, { forward: true })
}

function setPetWindowAtHome(atHome: boolean): void {
  if (!petWindow) return

  if (atHome) {
    petWindow.hide()
    return
  }

  petWindow.show()
  petWindow.setIgnoreMouseEvents(true, { forward: true })
}

function notifyHomeVisibility(visible: boolean): void {
  setPetWindowAtHome(visible)
  petWindow?.webContents.send('home-visibility-changed', visible)
}

function bindHomeWindowEvents(win: BrowserWindow): void {
  win.on('show', () => {
    notifyHomeVisibility(true)
  })

  win.on('hide', () => {
    notifyHomeVisibility(false)
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
 * 桌宠窗口：透明、无边框、置顶，桌面上只显示 Live2D 模型。
 */
function createPetWindow(): void {
  const initialPos = centerPetWindowBounds(PET_BOOTSTRAP_WIDTH, PET_BOOTSTRAP_HEIGHT)

  petWindowWidth = PET_BOOTSTRAP_WIDTH
  petWindowHeight = PET_BOOTSTRAP_HEIGHT

  petWindow = new BrowserWindow({
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

  lockPetWindowSize(PET_BOOTSTRAP_WIDTH, PET_BOOTSTRAP_HEIGHT)

  petWindow.on('ready-to-show', () => {
    showPetWindowIfNeeded()
  })

  petWindow.on('closed', () => {
    petWindow = null
  })

  loadRenderer(petWindow, 'pet')
}

/**
 * 「家」窗口：普通窗口，用于聊天、设置、背景等（默认隐藏）。
 */
function createHomeWindow(): void {
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
}

function registerIpc(): void {
  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && win === petWindow) {
      win.setIgnoreMouseEvents(ignore, { forward: true })
    }
  })

  ipcMain.handle('get-pet-window-position', () => {
    if (!petWindow) {
      return { x: 0, y: 0 }
    }
    const [x, y] = petWindow.getPosition()
    return { x, y }
  })

  ipcMain.handle('set-pet-window-size', (_event, width: number, height: number) => {
    lockPetWindowSize(width, height)
    showPetWindowIfNeeded()
    return { width: petWindowWidth, height: petWindowHeight }
  })

  ipcMain.handle(
    'set-pet-window-overlay',
    (_event, width: number, height: number, recenter?: boolean) => {
      return setPetWindowOverlay(width, height, recenter ?? false)
    }
  )

  ipcMain.on('set-pet-window-position', (_event, x: number, y: number) => {
    if (!petWindow) return
    petWindow.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: petWindowWidth,
      height: petWindowHeight
    })
  })

  ipcMain.on('open-home', () => {
    createHomeWindow()
  })

  ipcMain.on('quit-app', () => {
    isQuitting = true
    app.quit()
  })

  ipcMain.handle('read-touch-config', () => {
    return readTouchConfig()
  })

  ipcMain.handle('read-tts-capabilities', () => {
    return readTtsEngineCapabilities()
  })

  ipcMain.handle('get-live2d-model-url', () => {
    return resolveLive2DModelWebPath() ?? DEFAULT_LIVE2D_MODEL_WEB_PATH
  })

  ipcMain.handle('read-voice-forge-config', () => {
    return readVoiceForgeConfig()
  })

  ipcMain.handle('read-sample-corpus', (_event, folderId: string) => {
    return readSampleCorpus(folderId)
  })

  ipcMain.handle('write-touch-config', (_event, mode: TouchFeedbackMode, corpus: CorpusData) => {
    writeTouchConfig(mode, corpus)
    return { ok: true }
  })

  ipcMain.handle(
    'write-voice-forge-config',
    (_event, mode: TouchFeedbackMode, corpus: CorpusData, instruct: string) => {
      writeVoiceForgeConfig(mode, corpus, instruct)
      return { ok: true }
    }
  )

  ipcMain.handle('request-voice-model-regeneration', () => {
    requestVoiceModelRegeneration()
    return { ok: true }
  })

  ipcMain.handle(
    'prepare-voice-creation',
    (
      _event,
      mode: TouchFeedbackMode,
      corpus: CorpusData,
      instruct: string,
      displayName: string
    ) => {
      const profile = prepareVoiceCreation(mode, corpus, instruct, displayName)
      broadcastVoiceSamplesChanged()
      return profile
    }
  )

  ipcMain.handle('read-experimental-voice-upload', () => {
    return { enabled: readExperimentalVoiceUploadEnabled() }
  })

  ipcMain.handle('set-experimental-voice-upload', (_event, enabled: boolean) => {
    writeExperimentalVoiceUploadEnabled(Boolean(enabled))
    return { enabled: readExperimentalVoiceUploadEnabled() }
  })

  ipcMain.handle('pick-voice-upload-wav', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(parent ?? undefined, {
      title: '选择克隆参考音 WAV',
      properties: ['openFile'],
      filters: [{ name: 'WAV 音频', extensions: ['wav'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const filePath = result.filePaths[0]
    pendingVoiceUploadPath = filePath
    return {
      fileName: basename(filePath)
    }
  })

  ipcMain.handle('cancel-voice-upload-staging', () => {
    pendingVoiceUploadPath = null
    return { ok: true }
  })

  ipcMain.handle(
    'prepare-voice-upload',
    (
      _event,
      payload: {
        displayName: string
        corpus: CorpusData
        referenceText: string
      }
    ) => {
      if (!readExperimentalVoiceUploadEnabled()) {
        throw new Error('实验级上传功能未开启')
      }
      if (!pendingVoiceUploadPath) {
        throw new Error('请先选择 WAV 文件')
      }
      const wavBuffer = readFileSync(pendingVoiceUploadPath)
      pendingVoiceUploadPath = null
      const profile = prepareVoiceUpload(
        payload.displayName,
        payload.corpus,
        payload.referenceText,
        wavBuffer
      )
      broadcastVoiceSamplesChanged()
      return profile
    }
  )

  ipcMain.handle(
    'show-risk-confirm-dialog',
    async (event, options: { title: string; message: string; cancelLabel: string; confirmLabel: string }) => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showMessageBox(parent ?? undefined, {
        type: 'warning',
        buttons: [options.cancelLabel, options.confirmLabel],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: options.title,
        message: options.message
      })
      return result.response === 1
    }
  )

  ipcMain.handle('list-voice-samples', () => {
    return listVoiceSamples()
  })

  ipcMain.handle('switch-voice-sample', (_event, folderId: string) => {
    const profile = switchVoiceSample(folderId)
    broadcastVoiceSamplesChanged()
    return profile
  })

  ipcMain.handle('delete-voice-sample', (_event, folderId: string) => {
    const result = deleteVoiceSample(folderId)
    broadcastVoiceSamplesChanged()
    return result
  })

  ipcMain.handle('cancel-voice-forge-review', () => {
    const result = cancelVoiceForgeReview()
    broadcastVoiceSamplesChanged()
    return result
  })

  ipcMain.handle(
    'complete-voice-switch',
    async (
      _event,
      payload: {
        touchMode: 'curated' | 'custom_corpus'
        loadMode?: 'curated' | 'engine' | 'prewarm' | 'realtime'
        prewarm?: boolean
      }
    ) => {
      await completeVoiceSwitchOnPet(payload)
      broadcastVoiceSamplesChanged()
      return { ok: true }
    }
  )

  ipcMain.handle(
    'begin-voice-engine-load',
    async (
      _event,
      payload: {
        title: string
        message: string
        mode: 'curated' | 'engine' | 'prewarm' | 'realtime'
        sync?: boolean
      }
    ) => {
      return beginVoiceEngineLoadOnPet(payload)
    }
  )

  ipcMain.on('voice-engine-load-finished', (_event, result: { ok: boolean }) => {
    pendingVoiceEngineLoadResolve?.(result)
    pendingVoiceEngineLoadResolve = null
  })

  ipcMain.handle('apply-corpus-prewarm', (_event, folderId: string, corpus: CorpusData) => {
    const profile = applyCorpusPrewarm(folderId, corpus)
    broadcastVoiceSamplesChanged()
    return profile
  })

  ipcMain.handle('apply-alt-engine-corpus', (_event, corpus: CorpusData) => {
    return applyAltEngineCorpus(corpus)
  })

  ipcMain.handle('disable-alt-engine-corpus', () => {
    return disableAltEngineCorpus()
  })

  ipcMain.handle('notify-voice-samples-changed', () => {
    broadcastVoiceSamplesChanged()
    return { ok: true }
  })

  ipcMain.handle('set-official-touch-playback', (_event, useCuratedClips: boolean) => {
    const result = setOfficialTouchPlayback(useCuratedClips)
    broadcastVoiceSamplesChanged()
    return { ok: true, ...result }
  })

  ipcMain.handle('check-official-touch-cache-ready', () => {
    return { ready: isOfficialTouchCacheReady() }
  })

  ipcMain.handle('read-realtime-inference-flag', () => {
    return { enabled: readRealtimeInferenceFlag() }
  })

  ipcMain.handle('set-realtime-touch-inference', (_event, enabled: boolean) => {
    const result = setRealtimeTouchInference(enabled)
    broadcastVoiceSamplesChanged()
    return result
  })

  ipcMain.handle(
    'show-confirm-dialog',
    async (event, options: { title: string; message: string; confirmLabel?: string }) => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showMessageBox(parent ?? undefined, {
        type: 'question',
        buttons: ['取消', options.confirmLabel ?? '确定'],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
        title: options.title,
        message: options.message
      })
      return result.response === 1
    }
  )

  ipcMain.handle('relaunch-app', async () => {
    if (!app.isPackaged) {
      console.log('[Electron] dev soft-reload (keep dev server and TTS running)')
      const windows = BrowserWindow.getAllWindows()
      await Promise.all(
        windows.map(
          (win) =>
            new Promise<void>((resolve) => {
              const timeout = setTimeout(() => resolve(), 8000)
              win.webContents.once('did-finish-load', () => {
                clearTimeout(timeout)
                resolve()
              })
              win.webContents.reloadIgnoringCache()
            })
        )
      )
      return { ok: true, mode: 'reload' }
    }

    console.log('[Electron] relaunch-app requested')
    isQuitting = true
    for (const win of BrowserWindow.getAllWindows()) {
      win.removeAllListeners('close')
    }
    app.relaunch({ args: process.argv.slice(1).filter((arg) => arg !== '--relaunched') })
    setImmediate(() => {
      app.exit(0)
    })
    return { ok: true, mode: 'relaunch' }
  })
}

app.on('before-quit', () => {
  isQuitting = true
  appInstanceLock.clearLock(process.pid)
})

app.whenReady().then(() => {
  appInstanceLock.writeLock(process.pid, 'app')
  resetExperimentalFeaturesOnStartup()
  reconcileVoiceRuntimeConfig()
  registerIpc()
  createPetWindow()

  app.on('activate', () => {
    if (!petWindow) {
      createPetWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
