/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

type WindowType = 'pet' | 'home'

interface ElectronAPI {
  platform: NodeJS.Platform
  getWindowType: () => WindowType
  setIgnoreMouseEvents: (ignore: boolean) => void
  getPetWindowPosition: () => Promise<{ x: number; y: number }>
  setPetWindowPosition: (x: number, y: number) => void
  onHomeVisibilityChanged: (callback: (visible: boolean) => void) => () => void
  openHome: () => void
  quitApp: () => void
}

interface Window {
  electronAPI: ElectronAPI
}
