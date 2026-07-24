import { ipcMain } from 'electron'

import { readMemoryFlags } from '../memory/flags'
import {
  isMemoryReady,
  requireMemoryDb,
  notePreferredConsolidateSession
} from '../memory/runtime'
import { appendRawLog, getRecentHistoryForPrompt, listTimeline, type RawLogRole } from '../memory/engine'
import { buildPromptMemoryContext, formatPromptMemoryBlock } from '../memory/retriever'
import { memoryBudgetForMode } from '../memory/memoryBudgets'
import { maybeRunPeriodRollups } from '../memory/periodRollup'
import { maybeConsolidateOnRoundCap } from '../memory/consolidate'
import { recordMemoryPeek, consumePendingPeeksForUserTurn } from '../memory/peek'
import { readChatConfigFile, toChatConfigView } from '../chat/chat-config'
import { logWarn } from '../logging/logger'

function guardEnabled(): { ok: true } | { ok: false; detail: string } {
  if (!isMemoryReady()) return { ok: false, detail: 'memory_db_unavailable' }
  if (!readMemoryFlags().memoryEnabled) return { ok: false, detail: 'memory_disabled' }
  return { ok: true }
}

export function registerMemoryIpc(): void {
  ipcMain.handle('memory-get-status', () => {
    const flags = readMemoryFlags()
    return {
      ready: isMemoryReady(),
      memoryEnabled: flags.memoryEnabled,
      memoryConsolidateOnChatClose: flags.memoryConsolidateOnChatClose,
      memoryLlmSummarizeEnabled: flags.memoryLlmSummarizeEnabled,
      memoryEmotionScoreEnabled: flags.memoryEmotionScoreEnabled
    }
  })

  ipcMain.handle(
    'memory-append-raw-log',
    (
      _event,
      payload: { sessionId: string; role: RawLogRole; content: string; timestamp?: number }
    ) => {
      const gate = guardEnabled()
      if (!gate.ok) return gate
      if (!payload?.sessionId || !payload.role || typeof payload.content !== 'string') {
        return { ok: false as const, detail: 'invalid_payload' }
      }
      const { id } = appendRawLog(requireMemoryDb(), {
        sessionId: payload.sessionId,
        role: payload.role,
        content: payload.content,
        timestamp: payload.timestamp ? new Date(payload.timestamp) : undefined
      })
      return { ok: true as const, id }
    }
  )

  ipcMain.handle('memory-list-timeline', (_event, payload?: { layer?: string; limit?: number }) => {
    const gate = guardEnabled()
    if (!gate.ok) return gate
    const items = listTimeline(requireMemoryDb(), {
      layer: payload?.layer,
      limit: payload?.limit
    })
    return { ok: true as const, items }
  })

  ipcMain.handle('memory-get-recent-history', (_event, payload?: { maxRounds?: number }) => {
    const gate = guardEnabled()
    if (!gate.ok) return gate
    const maxRounds = Math.max(0, Math.floor(Number(payload?.maxRounds) || 0))
    const messages = getRecentHistoryForPrompt(requireMemoryDb(), maxRounds)
    return { ok: true as const, messages }
  })

  ipcMain.handle(
    'memory-get-prompt-context',
    (_event, payload?: { userInput?: string; maxSummaryTokens?: number }) => {
      const gate = guardEnabled()
      if (!gate.ok) return gate
      const userInput = typeof payload?.userInput === 'string' ? payload.userInput : ''
      const budget = memoryBudgetForMode(toChatConfigView(readChatConfigFile()).llmMode)
      const ctx = buildPromptMemoryContext(requireMemoryDb(), {
        userInput,
        maxSummaryTokens: payload?.maxSummaryTokens,
        budget
      })
      return {
        ok: true as const,
        coreMemories: ctx.coreMemories,
        userProfileBlock: ctx.userProfileBlock,
        summaries: ctx.summaries,
        summaryTokensUsed: ctx.summaryTokensUsed,
        budget: {
          profile: budget.profile,
          corePoolMax: budget.corePoolMax,
          coreMaxTokens: budget.coreMaxTokens,
          summaryMaxTokens: budget.summaryMaxTokens
        },
        block: formatPromptMemoryBlock(ctx)
      }
    }
  )

  ipcMain.handle('memory-consume-pending-peeks', () => {
    const gate = guardEnabled()
    if (!gate.ok) return gate
    const result = consumePendingPeeksForUserTurn(requireMemoryDb())
    return { ok: true as const, ...result }
  })

  ipcMain.handle('memory-maybe-period-rollup', async () => {
    const gate = guardEnabled()
    if (!gate.ok) return gate
    try {
      const result = await maybeRunPeriodRollups(requireMemoryDb())
      return { ok: true as const, ...result }
    } catch (error) {
      logWarn('memory', 'memory-maybe-period-rollup failed', error)
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false as const, detail }
    }
  })

  ipcMain.handle(
    'memory-maybe-mid-session-consolidate',
    async (_event, payload?: { sessionId?: string }) => {
      const gate = guardEnabled()
      if (!gate.ok) return gate
      const sessionId =
        typeof payload?.sessionId === 'string' && payload.sessionId.trim()
          ? payload.sessionId.trim()
          : ''
      if (!sessionId) return { ok: false as const, detail: 'invalid_payload' }
      try {
        const llmMode = toChatConfigView(readChatConfigFile()).llmMode
        const result = await maybeConsolidateOnRoundCap(requireMemoryDb(), {
          summarySessionId: sessionId,
          llmMode
        })
        return result
      } catch (error) {
        logWarn('memory', 'memory-maybe-mid-session-consolidate failed', error)
        const detail = error instanceof Error ? error.message : String(error)
        return { ok: false as const, reason: 'error' as const, detail }
      }
    }
  )

  ipcMain.handle('memory-record-peek', () => {
    const gate = guardEnabled()
    if (!gate.ok) return gate
    const result = recordMemoryPeek(requireMemoryDb())
    return { ok: true as const, ...result }
  })

  ipcMain.handle('memory-notify-chat-closed', (_event, payload?: { sessionId?: string }) => {
    notePreferredConsolidateSession(payload?.sessionId)
    return { ok: true as const }
  })
}
