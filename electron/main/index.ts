import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'

let petWindow: BrowserWindow | null = null
let homeWindow: BrowserWindow | null = null
let isQuitting = false

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

/**
 * 桌宠窗口：透明、无边框、置顶，桌面上只显示 Live2D 模型。
 */
function createPetWindow(): void {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  petWindow = new BrowserWindow({
    width: 360,
    height: 480,
    x: screenW - 380,
    y: screenH - 500,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
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

  petWindow.on('ready-to-show', () => {
    petWindow?.show()
    // 默认鼠标穿透，渲染进程在指针移到模型上时会关闭穿透
    petWindow?.setIgnoreMouseEvents(true, { forward: true })
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

  homeWindow.on('ready-to-show', () => {
    homeWindow?.show()
    homeWindow?.focus()
  })

  homeWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      homeWindow?.hide()
    }
  })

  homeWindow.on('closed', () => {
    homeWindow = null
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

  ipcMain.on('open-home', () => {
    createHomeWindow()
  })

  ipcMain.on('quit-app', () => {
    isQuitting = true
    app.quit()
  })
}

app.on('before-quit', () => {
  isQuitting = true
})

app.whenReady().then(() => {
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
