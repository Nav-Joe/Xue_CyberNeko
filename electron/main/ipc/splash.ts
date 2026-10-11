import { ipcMain } from 'electron'

import { markSplashPetFrameReady, setSplashProgress } from '../windows/splashWindow'

export function registerSplashIpc(): void {
  ipcMain.on('splash-renderer-ready', () => {
    setSplashProgress(65)
  })

  // 仅标记模型就绪；关窗需同时等 TTS /health ready
  ipcMain.on('splash-pet-frame-ready', () => {
    markSplashPetFrameReady()
  })
}
