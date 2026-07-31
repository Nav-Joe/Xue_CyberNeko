import { ipcRenderer } from 'electron'

/**
 * 好感域 preload（鉴定、注入、只读快照）。
 * 扁平挂到 `window.electronAPI`（避免继续堆 preload/index.ts）。
 */
export const relationshipApi = {
  relationshipGetStatus: (): Promise<{
    ready: boolean
    memoryEnabled: boolean
    relationshipEnabled: boolean
    active: boolean
  }> => {
    return ipcRenderer.invoke('relationship-get-status')
  },

  relationshipGetPromptBlock: (): Promise<
    { ok: true; block: string } | { ok: false; detail: string; block: string }
  > => {
    return ipcRenderer.invoke('relationship-get-prompt-block')
  },

  relationshipGetSnapshot: (payload?: {
    nowMs?: number
  }): Promise<
    | {
        ok: true
        scores: { closeness: number; trust: number; rapport: number }
        tags: { closeness: string; trust: string; rapport: string }
        netToday: { closeness: number; trust: number; rapport: number }
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('relationship-get-snapshot', payload)
  },

  relationshipApplyEval: (payload: {
    rounds: Array<{ userText: string; assistantText: string }>
    source: 'llm_turn' | 'chat_close'
  }): Promise<
    | { ok: true; skipped?: string; applied?: number }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('relationship-apply-eval', payload)
  }
}
