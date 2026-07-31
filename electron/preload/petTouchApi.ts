import { ipcRenderer } from 'electron'

type PetTouchPart = 'head' | 'arms' | 'body' | 'legs' | 'tail'

/**
 * 摸摸计数 preload API（避免堆 preload/index.ts）。
 */
export const petTouchApi = {
  petTouchGetToday: (payload?: {
    nowMs?: number
  }): Promise<
    | {
        ok: true
        dayKey: string
        counts: Record<PetTouchPart, number>
        total: number
        affectionGrants: number
        affectionCap: number
        affectionEnabled: boolean
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('pet-touch-get-today', payload)
  },

  petTouchGetPromptBlock: (payload?: {
    nowMs?: number
  }): Promise<{ ok: true; block: string } | { ok: false; detail: string; block: string }> => {
    return ipcRenderer.invoke('pet-touch-get-prompt-block', payload)
  },

  petTouchRecord: (payload: {
    part: PetTouchPart
    nowMs?: number
  }): Promise<
    | {
        ok: true
        dayKey: string
        counts: Record<PetTouchPart, number>
        total: number
        affectionGrants: number
        affectionCap: number
        affectionEnabled: boolean
        affectionGranted?: boolean
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('pet-touch-record', payload)
  }
}
