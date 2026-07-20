import { BrowserWindow, dialog, ipcMain } from 'electron'
import { basename } from 'path'

export type AppDialogsIpcDeps = {
  setPendingVoiceUploadPath: (filePath: string | null) => void
}

export function registerAppDialogsIpc(deps: AppDialogsIpcDeps): void {
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
    deps.setPendingVoiceUploadPath(filePath)
    return {
      fileName: basename(filePath)
    }
  })
}
