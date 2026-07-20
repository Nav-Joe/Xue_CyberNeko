import { app, BrowserWindow, ipcMain } from 'electron'

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
