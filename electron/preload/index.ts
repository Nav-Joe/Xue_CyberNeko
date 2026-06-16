import { contextBridge, ipcRenderer } from 'electron'

export type WindowType = 'pet' | 'home'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  /** 当前窗口类型，由 URL hash 决定（#pet / #home） */
  getWindowType: (): WindowType => {
    const hash = window.location.hash.replace('#', '')
    return hash === 'home' ? 'home' : 'pet'
  },

  /** 桌宠窗：是否让鼠标穿透（true = 穿透到桌面下层） */
  setIgnoreMouseEvents: (ignore: boolean): void => {
    ipcRenderer.send('set-ignore-mouse-events', ignore)
  },

  /** 打开「家」窗口 */
  openHome: (): void => {
    ipcRenderer.send('open-home')
  },

  /** 退出应用 */
  quitApp: (): void => {
    ipcRenderer.send('quit-app')
  }
})
