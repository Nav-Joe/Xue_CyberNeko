import { ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ScreenCompanionConfigView,
  ScreenObservation
} from '../main/screenCompanion/types'
import type { ScreenCompanionSessionEvent } from '../main/screenCompanion/sessionEvents'

export type ScreenCompanionNarrateEvent = {
  text: string
  gameName: string
  ts: number
}

/**
 * 屏幕偷窥的 preload API（独立配置，不并进聊天配置）。
 * 扁平挂到 `window.electronAPI`。
 */
export const screenCompanionApi = {
  screenCompanionGetStatus: (): Promise<
    | {
        ok: true
        enabled: boolean
        paused: boolean
        pausedUntilMs: number | null
        hasVisionApiKey: boolean
        visionConfigured: boolean
        latestObservation: ScreenObservation | null
        schedulerRunning: boolean
        sessionActive: boolean
        playingGameName: string | null
        lastObservedAtMs: number | null
        lastNarratedAtMs: number | null
        nextObserveAtMs: number | null
      }
    | { ok: false; detail: string }
  > => ipcRenderer.invoke('screen-companion-get-status'),

  screenCompanionReadConfig: (): Promise<
    { ok: true; config: ScreenCompanionConfigView } | { ok: false; detail: string }
  > => ipcRenderer.invoke('screen-companion-read-config'),

  screenCompanionWriteConfig: (
    payload: ScreenCompanionConfigView & {
      visionApiKey?: string
      clearVisionApiKey?: boolean
    }
  ): Promise<
    | { ok: true; config: ScreenCompanionConfigView }
    | { ok: false; detail: string }
  > => ipcRenderer.invoke('screen-companion-write-config', payload),

  screenCompanionObserveOnce: (): Promise<
    | {
        ok: true
        observation: ScreenObservation
        captureMs?: number
        encodeMs?: number
        visionMs?: number
        totalObserveMs: number
      }
    | { ok: false; detail: string }
  > => ipcRenderer.invoke('screen-companion-observe-once'),

  screenCompanionOnSession: (listener: (event: ScreenCompanionSessionEvent) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: ScreenCompanionSessionEvent) => {
      listener(payload)
    }
    ipcRenderer.on('screen-companion-session', handler)
    return () => {
      ipcRenderer.removeListener('screen-companion-session', handler)
    }
  },

  screenCompanionOnNarrate: (listener: (event: ScreenCompanionNarrateEvent) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: ScreenCompanionNarrateEvent) => {
      listener(payload)
    }
    ipcRenderer.on('screen-companion-narrate', handler)
    return () => {
      ipcRenderer.removeListener('screen-companion-narrate', handler)
    }
  },

  screenCompanionNotifyNarrateDone: (payload: {
    ts: number
    ok?: boolean
  }): Promise<{ ok: true } | { ok: false }> =>
    ipcRenderer.invoke('screen-companion-narrate-done', payload)
}
