import { ipcRenderer } from 'electron'

/**
 * 冷启动加载窗进度（扁平挂到 electronAPI）。
 */
export const splashApi = {
  notifySplashRendererReady: (): void => {
    ipcRenderer.send('splash-renderer-ready')
  },
  notifySplashPetFrameReady: (): void => {
    ipcRenderer.send('splash-pet-frame-ready')
  }
}
