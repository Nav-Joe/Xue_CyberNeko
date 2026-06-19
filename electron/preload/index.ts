import { contextBridge, ipcRenderer } from 'electron'

export type WindowType = 'pet' | 'home'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  getWindowType: (): WindowType => {
    const hash = window.location.hash.replace('#', '')
    return hash === 'home' ? 'home' : 'pet'
  },

  setIgnoreMouseEvents: (ignore: boolean): void => {
    ipcRenderer.send('set-ignore-mouse-events', ignore)
  },

  getPetWindowPosition: (): Promise<{ x: number; y: number }> => {
    return ipcRenderer.invoke('get-pet-window-position')
  },

  setPetWindowPosition: (x: number, y: number): void => {
    ipcRenderer.send('set-pet-window-position', x, y)
  },

  onHomeVisibilityChanged: (callback: (visible: boolean) => void): (() => void) => {
    const handler = (_event: unknown, visible: boolean): void => {
      callback(visible)
    }
    ipcRenderer.on('home-visibility-changed', handler)
    return () => {
      ipcRenderer.removeListener('home-visibility-changed', handler)
    }
  },

  openHome: (): void => {
    ipcRenderer.send('open-home')
  },

  quitApp: (): void => {
    ipcRenderer.send('quit-app')
  }
})
