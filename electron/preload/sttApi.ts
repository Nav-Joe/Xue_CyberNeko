import { ipcRenderer } from 'electron'

/**
 * STT 侧车代启 preload（避免继续堆 preload/index.ts）。
 * 扁平挂到 `window.electronAPI`。
 */
export const sttApi = {
  ensureSttService: (): Promise<
    { ok: true; baseUrl: string; reused: boolean } | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('stt-ensure-service')
  },

  stopManagedSttService: (): Promise<{ ok: true; stopped: boolean }> => {
    return ipcRenderer.invoke('stt-stop-managed')
  }
}
