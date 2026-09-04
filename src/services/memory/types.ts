import type { ChatHistoryMessage } from '../chat/types'

export type MemoryTimelineItem =
  | {
      kind: 'summary'
      id: string
      summary: string
      keyFacts: string[]
      emotionTags: string[]
      significance: number
      keywords: string[]
      source?: 'chat' | 'companion'
      sourceLabel?: string | null
      startedAt: number
      endedAt: number | null
      messageCount: number
    }
  | {
      kind: 'period'
      id: string
      periodKind: 'weekly' | 'monthly'
      summary: string
      keyFacts: string[]
      emotionTags: string[]
      significance: number
      keywords: string[]
      periodStart: number
      periodEnd: number
    }
  | {
      kind: 'core'
      id: string
      category: string
      content: string
      /** 活力系数 */
      weight: number
      fixed: boolean
      updatedAt: number
    }

/** 记忆域 preload 扁平 API（与 `electron/preload/memoryApi.ts` 对齐） */
export type MemoryElectronApi = {
  memoryGetStatus: () => Promise<{
    ready: boolean
    memoryEnabled: boolean
    memoryConsolidateOnChatClose: boolean
    memoryLlmSummarizeEnabled?: boolean
    memoryEmotionScoreEnabled?: boolean
  }>
  memoryAppendRawLog: (payload: {
    sessionId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp?: number
  }) => Promise<{ ok: true; id: string } | { ok: false; detail: string }>
  memoryListTimeline: (payload?: {
    layer?: string
    limit?: number
  }) => Promise<{ ok: true; items: MemoryTimelineItem[] } | { ok: false; detail: string }>
  memoryGetRecentHistory: (payload: {
    maxRounds: number
  }) => Promise<{ ok: true; messages: ChatHistoryMessage[] } | { ok: false; detail: string }>
  memoryGetPromptContext: (payload: {
    userInput: string
    summaryLimit?: number
  }) => Promise<
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
  >
  memoryConsumePendingPeeks: () => Promise<
    { ok: true; prefix: string; count: number; stamps: string[] } | { ok: false; detail: string }
  >
  memoryMaybePeriodRollup: () => Promise<
    | {
        ok: true
        weeklyDone: number
        monthlyDone: number
        profileUpdated: boolean
        skipped?: string
      }
    | { ok: false; detail: string }
  >
  memoryMaybeMidSessionConsolidate: (payload: {
    sessionId: string
  }) => Promise<
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
  >
  memoryRecordPeek: () => Promise<
    | {
        ok: true
        recorded: true
        eventId: string
        atMs: number
        stamp: string
      }
    | { ok: false; detail: string }
  >
  memoryNotifyChatClosed: (payload?: { sessionId?: string }) => Promise<{ ok: true }>
}
