import { ipcRenderer } from 'electron'

/**
 * 欲望域 preload（发前注入 + 轮后鉴定）。
 * 扁平挂到 `window.electronAPI`（避免继续堆 preload/index.ts）。
 */
export const desireApi = {
  desireGetStatus: (): Promise<{
    ready: boolean
    memoryEnabled: boolean
    desireEnabled: boolean
    active: boolean
  }> => {
    return ipcRenderer.invoke('desire-get-status')
  },

  desireGetPromptBlock: (payload?: {
    nowMs?: number
  }): Promise<{ ok: true; block: string } | { ok: false; detail: string; block: string }> => {
    return ipcRenderer.invoke('desire-get-prompt-block', payload)
  },

  /** 调试插入欲望；正式创建见轮后鉴定 */
  desireInsertTest: (payload: {
    name: string
    description?: string
    intensity?: number
    patienceMax?: number
    patienceRemaining?: number
  }): Promise<{ ok: true; id: string } | { ok: false; detail: string }> => {
    return ipcRenderer.invoke('desire-insert-test', payload)
  },

  desireApplyAfterTurn: (payload: {
    userText: string
    assistantText: string
  }): Promise<
    | { ok: true; skipped?: string; createdIds?: string[]; touched?: number }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('desire-apply-after-turn', payload)
  }
}
