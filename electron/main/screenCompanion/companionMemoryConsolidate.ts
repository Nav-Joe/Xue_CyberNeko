/**
 * 退出陪玩会话后：读临时日志 → 用 LLM 写成一条会话总结 → 再参与周/月滚总结。
 */
import { runOnConsolidateChain } from '../memory/consolidate'
import { requireMemoryDb, isMemoryReady } from '../memory/runtime'
import { accumulateSessionSummary, updateSessionSummaryScore } from '../memory/engine'
import { readMemoryFlags } from '../memory/flags'
import { memoryBudgetForMode } from '../memory/memoryBudgets'
import { tryPromoteToCorePool } from '../memory/corePool'
import { summarizeCompanionLogsWithLlm } from '../memory/summarizeCompanionLlm'
import { readChatConfigFile, toChatConfigView } from '../chat/chat-config'
import { logInfo, logWarn } from '../logging/logger'
import { parseMemoryKind } from '../memory/vitality'
import {
  readCompanionMemoryLog,
  removeCompanionMemoryLog
} from './companionMemoryLog'

export type CompanionMemoryConsolidateInput = {
  companionSessionId: string
  gameName: string
  startedAtMs: number
  endedAtMs: number
}

export type CompanionMemoryConsolidateResult =
  | { ok: true; summaryId: string; entryCount: number; significance?: number }
  | { ok: false; reason: 'disabled' | 'empty' | 'db_unready' | 'llm_failed' | 'error'; detail?: string }

export function scheduleCompanionMemoryConsolidate(input: CompanionMemoryConsolidateInput): void {
  if (!readMemoryFlags().memoryEnabled) return
  void runOnConsolidateChain(() => consolidateCompanionSessionOnLeave(input)).catch((error) => {
    logWarn('screenCompanion', 'companion memory consolidate chain failed', error)
  })
}

export async function consolidateCompanionSessionOnLeave(
  input: CompanionMemoryConsolidateInput
): Promise<CompanionMemoryConsolidateResult> {
  try {
    const flags = readMemoryFlags()
    if (!flags.memoryEnabled) {
      return { ok: false, reason: 'disabled' }
    }
    if (!flags.memoryLlmSummarizeEnabled) {
      logInfo('screenCompanion', 'companion consolidate skipped', 'memoryLlmSummarizeEnabled=false')
      removeCompanionMemoryLog(input.companionSessionId)
      return { ok: false, reason: 'disabled', detail: 'llm_summarize_off' }
    }
    if (!isMemoryReady()) {
      return { ok: false, reason: 'db_unready' }
    }

    const entries = readCompanionMemoryLog(input.companionSessionId)
    if (entries.length === 0) {
      removeCompanionMemoryLog(input.companionSessionId)
      return { ok: false, reason: 'empty' }
    }

    let scored
    try {
      scored = await summarizeCompanionLogsWithLlm({
        gameName: input.gameName,
        entries
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      logWarn('screenCompanion', 'companion consolidate LLM failed; keep jsonl', error)
      return { ok: false, reason: 'llm_failed', detail }
    }

    const db = requireMemoryDb()
    const startedAt = new Date(input.startedAtMs)
    const endedAt = new Date(input.endedAtMs)
    accumulateSessionSummary(db, {
      id: input.companionSessionId,
      summary: scored.summary,
      keyFacts: scored.keyFacts,
      emotionTags: scored.emotionTags,
      memoryKind: parseMemoryKind(scored.memoryKind),
      source: 'companion',
      sourceLabel: input.gameName,
      startedAt,
      endedAt,
      messageCount: entries.length
    })

    let significance: number | undefined
    if (flags.memoryEmotionScoreEnabled) {
      significance = scored.significance
      updateSessionSummaryScore(db, {
        id: input.companionSessionId,
        significance: scored.significance,
        keywords: scored.keywords,
        memoryKind: scored.memoryKind
      })
      let budget = memoryBudgetForMode('openai_api')
      try {
        budget = memoryBudgetForMode(toChatConfigView(readChatConfigFile()).llmMode)
      } catch {
        /* vitest */
      }
      tryPromoteToCorePool(db, {
        content: scored.summary,
        significance: scored.significance,
        keywords: scored.keywords,
        memoryKind: scored.memoryKind,
        sourceSession: input.companionSessionId,
        budget
      })
    }

    removeCompanionMemoryLog(input.companionSessionId)
    logInfo(
      'screenCompanion',
      'companion memory consolidated',
      `id=${input.companionSessionId} entries=${entries.length} game=${input.gameName}`
    )

    void import('../memory/periodRollup')
      .then(({ maybeRunPeriodRollups }) => maybeRunPeriodRollups(db))
      .catch((error) => {
        logWarn('screenCompanion', 'post-companion period rollup failed', error)
      })

    return {
      ok: true,
      summaryId: input.companionSessionId,
      entryCount: entries.length,
      significance
    }
  } catch (error) {
    logWarn('screenCompanion', 'consolidateCompanionSessionOnLeave failed', error)
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'error', detail }
  }
}
