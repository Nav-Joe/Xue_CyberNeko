import { app, BrowserWindow, ipcMain } from 'electron'

import { logInfo } from '../logging/logger'

export type AppLifecycleIpcDeps = {
  createHomeWindow: () => void
  setQuitting: (value: boolean) => void
}

export function registerAppLifecycleIpc(deps: AppLifecycleIpcDeps): void {
  ipcMain.on('open-home', () => {
    deps.createHomeWindow()
  })

  ipcMain.on('quit-app', () => {
    deps.setQuitting(true)
    app.quit()
  })

  ipcMain.handle('relaunch-app', async () => {
    if (!app.isPackaged) {
      const windows = BrowserWindow.getAllWindows()
      logInfo(
        'main',
        'dev soft-reload: reloadIgnoringCache on all windows',
        `count=${windows.length} (chat messages are in-memory and will be wiped)`
      )
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

    logInfo('main', 'relaunch-app requested (packaged)')
    deps.setQuitting(true)
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
