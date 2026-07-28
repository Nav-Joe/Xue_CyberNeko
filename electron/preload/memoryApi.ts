import { ipcRenderer } from 'electron'

/**
 * 记忆域 preload API。
 * 扁平挂到 `window.electronAPI`（键名 / IPC channel 不变）。
 */
export const memoryApi = {
  memoryGetStatus: (): Promise<{
    ready: boolean
    memoryEnabled: boolean
    memoryConsolidateOnChatClose: boolean
    memoryLlmSummarizeEnabled?: boolean
    memoryEmotionScoreEnabled?: boolean
  }> => {
    return ipcRenderer.invoke('memory-get-status')
  },

  memoryAppendRawLog: (payload: {
    sessionId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp?: number
  }): Promise<{ ok: true; id: string } | { ok: false; detail: string }> => {
    return ipcRenderer.invoke('memory-append-raw-log', payload)
  },

  memoryListTimeline: (payload?: {
    layer?: string
    limit?: number
  }): Promise<
    | { ok: true; items: import('../../src/services/memory/types').MemoryTimelineItem[] }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('memory-list-timeline', payload)
  },

  memoryGetRecentHistory: (payload: {
    maxRounds: number
  }): Promise<
    | { ok: true; messages: import('../../src/services/chat/types').ChatHistoryMessage[] }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('memory-get-recent-history', payload)
  },

  memoryGetPromptContext: (payload: {
    userInput: string
    summaryLimit?: number
  }): Promise<
    | {
        ok: true
        coreMemories: Array<{ id: string; content: string; category: string; weight: number }>
        userProfileBlock?: string
        summaries: Array<{
          id: string
          summary: string
          significance: number
          keywords: string[]
          score: number
        }>
        summaryTokensUsed?: number
        block: string
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('memory-get-prompt-context', payload)
  },

  memoryConsumePendingPeeks: (): Promise<
    | { ok: true; prefix: string; count: number; stamps: string[] }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('memory-consume-pending-peeks')
  },

  memoryMaybePeriodRollup: (): Promise<
    | {
        ok: true
        weeklyDone: number
        monthlyDone: number
        profileUpdated: boolean
        skipped?: string
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('memory-maybe-period-rollup')
  },

  memoryMaybeMidSessionConsolidate: (payload: {
    sessionId: string
  }): Promise<
    | {
        ok: true
        triggered: true
        summaryId: string
        prunedRounds: number
        remainingRounds: number
        significance?: number
        corePromoted?: boolean
      }
    | {
        ok: true
        triggered: false
        reason: 'below_threshold' | 'empty'
        rounds?: number
        softMax?: number
      }
    | { ok: false; reason?: string; detail?: string }
  > => {
    return ipcRenderer.invoke('memory-maybe-mid-session-consolidate', payload)
  },

  memoryRecordPeek: (): Promise<
    | {
        ok: true
        recorded: true
        eventId: string
        atMs: number
        stamp: string
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('memory-record-peek')
  },

  memoryNotifyChatClosed: (payload?: {
    sessionId?: string
  }): Promise<{ ok: true }> => {
    return ipcRenderer.invoke('memory-notify-chat-closed', payload)
  }
}
