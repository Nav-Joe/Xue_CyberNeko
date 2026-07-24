import type { MemoryDatabase } from './dbCore'
import {
  accumulateSessionSummary,
  listDistinctRawSessionIds,
  listRawLogsForSession,
  pruneRawLogsBeyondSessionLimit,
  updateSessionSummaryScore
} from './engine'
import { tryPromoteToCorePool } from './corePool'
import { readMemoryFlags } from './flags'
import { logInfo, logWarn } from '../logging/logger'
import { memoryBudgetForMode } from './memoryBudgets'
import { summarizeLogsWithLlm } from './summarizeLlm'
import { readChatConfigFile, toChatConfigView } from '../chat/chat-config'
import {
  softKeepHistoryRoundsForMode,
  softMaxHistoryRoundsForMode
} from '../../../src/services/chat/historyWindow'
import type { ChatLlmMode } from '../../../src/services/chat/types'
import {
  countGlobalRawLogRounds,
  pruneRawLogsToKeepRecentRounds,
  takeOldestRawLogRounds
} from './rawLogRounds'
import { parseMemoryKind, type MemoryKind } from './vitality'

export type ConsolidateResult =
  | {
      ok: true
      sessionId: string
      summaryId: string
      prunedSessions: string[]
      engine: 'llm'
      significance?: number
      corePromoted?: boolean
    }
  | { ok: false; reason: 'empty' | 'error' | 'llm_failed' | 'disabled'; detail?: string }

export type MidSessionConsolidateResult =
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
  | { ok: false; reason: 'disabled' | 'llm_failed' | 'error'; detail?: string }

/** 关窗 / 日常总结互斥，避免并行打两次 LLM、交叉裁 raw */
let consolidateChain: Promise<unknown> = Promise.resolve()

function enqueueConsolidate<T>(fn: () => Promise<T>): Promise<T> {
  const run = consolidateChain.then(fn, fn)
  consolidateChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

type ScoredSummary = {
  summary: string
  keyFacts: string[]
  emotionTags: string[]
  significance: number
  keywords: string[]
  memoryKind: MemoryKind
}

type SummarizeLogRow = {
  role: string
  content: string
  timestamp: Date
}

async function summarizeLogsOrThrow(logs: SummarizeLogRow[]): Promise<ScoredSummary> {
  const llm = await summarizeLogsWithLlm(logs)
  return {
    summary: llm.summary,
    keyFacts: llm.keyFacts,
    emotionTags: llm.emotionTags,
    significance: llm.significance,
    keywords: llm.keywords,
    memoryKind: parseMemoryKind(llm.memoryKind)
  }
}

function applyScoredSummary(
  db: MemoryDatabase,
  summaryId: string,
  logs: SummarizeLogRow[],
  scored: ScoredSummary
): { corePromoted: boolean; recordedSignificance?: number } {
  const startedAt = logs[0]!.timestamp
  const endedAt = logs[logs.length - 1]!.timestamp
  accumulateSessionSummary(db, {
    id: summaryId,
    summary: scored.summary,
    keyFacts: scored.keyFacts,
    emotionTags: scored.emotionTags,
    memoryKind: scored.memoryKind,
    startedAt,
    endedAt,
    messageCount: logs.length
  })

  let corePromoted = false
  let recordedSignificance: number | undefined
  const flags = readMemoryFlags()
  if (flags.memoryEmotionScoreEnabled) {
    recordedSignificance = scored.significance
    updateSessionSummaryScore(db, {
      id: summaryId,
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
    const promo = tryPromoteToCorePool(db, {
      content: scored.summary,
      significance: scored.significance,
      keywords: scored.keywords,
      memoryKind: scored.memoryKind,
      sourceSession: summaryId,
      budget
    })
    corePromoted = promo.promoted
    logInfo(
      'memory',
      'consolidate score/core',
      `significance=${scored.significance} kind=${scored.memoryKind} promoted=${promo.promoted} reason=${promo.reason}`
    )
  }
  return { corePromoted, recordedSignificance }
}

/**
 * 关聊天窗整理：单次 LLM 输出 summary + significance + keywords；
 * 开关关闭或 LLM 失败则放弃本次（不写库）。成功后按 flag 写分并尝试核心池晋升。
 */
export async function consolidateOnChatClose(
  db: MemoryDatabase,
  preferredSessionId?: string
): Promise<ConsolidateResult> {
  return enqueueConsolidate(() => consolidateOnChatCloseInner(db, preferredSessionId))
}

async function consolidateOnChatCloseInner(
  db: MemoryDatabase,
  preferredSessionId?: string
): Promise<ConsolidateResult> {
  try {
    const flags = readMemoryFlags()
    if (!flags.memoryLlmSummarizeEnabled) {
      logInfo('memory', 'consolidateOnChatClose skipped', 'memoryLlmSummarizeEnabled=false')
      return { ok: false, reason: 'disabled' }
    }

    const sessionIds = listDistinctRawSessionIds(db)
    const target =
      preferredSessionId && sessionIds.includes(preferredSessionId)
        ? preferredSessionId
        : sessionIds[0]

    if (!target) {
      return { ok: false, reason: 'empty' }
    }

    const logs = listRawLogsForSession(db, target)
    if (logs.length === 0) {
      return { ok: false, reason: 'empty' }
    }

    let scored: ScoredSummary
    try {
      scored = await summarizeLogsOrThrow(logs)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      logWarn('memory', 'consolidateOnChatClose LLM failed; skip this summarize', error)
      return { ok: false, reason: 'llm_failed', detail }
    }

    const { corePromoted, recordedSignificance } = applyScoredSummary(db, target, logs, scored)

    const prunedSessions = pruneRawLogsBeyondSessionLimit(db)
    logInfo(
      'memory',
      'consolidateOnChatClose ok',
      `sessionId=${target} engine=llm messageCount=${logs.length} pruned=${prunedSessions.length}`
    )

    void import('./periodRollup')
      .then(({ maybeRunPeriodRollups }) => maybeRunPeriodRollups(db))
      .catch((error) => {
        logWarn('memory', 'post-consolidate period rollup failed', error)
      })

    return {
      ok: true,
      sessionId: target,
      summaryId: target,
      prunedSessions,
      engine: 'llm',
      significance: recordedSignificance,
      corePromoted
    }
  } catch (error) {
    logWarn('memory', 'consolidateOnChatClose failed', error)
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'error', detail }
  }
}

/**
 * 日常总结：全局 raw 轮数 ≥ 模式软上限时，总结最旧超额轮次并裁到 keep（OpenAI 50→30 / 本地 20→10）。
 * 失败不裁 raw。不替代关窗总结。
 */
export async function maybeConsolidateOnRoundCap(
  db: MemoryDatabase,
  input: { summarySessionId: string; llmMode?: ChatLlmMode }
): Promise<MidSessionConsolidateResult> {
  return enqueueConsolidate(() => maybeConsolidateOnRoundCapInner(db, input))
}

async function maybeConsolidateOnRoundCapInner(
  db: MemoryDatabase,
  input: { summarySessionId: string; llmMode?: ChatLlmMode }
): Promise<MidSessionConsolidateResult> {
  try {
    const flags = readMemoryFlags()
    if (!flags.memoryLlmSummarizeEnabled) {
      return { ok: false, reason: 'disabled' }
    }

    const mode =
      input.llmMode ??
      (() => {
        try {
          return toChatConfigView(readChatConfigFile()).llmMode
        } catch {
          return 'openai_api' as ChatLlmMode
        }
      })()
    const softMax = softMaxHistoryRoundsForMode(mode)
    const softKeep = softKeepHistoryRoundsForMode(mode)
    const rounds = countGlobalRawLogRounds(db)
    if (rounds < softMax) {
      return { ok: true, triggered: false, reason: 'below_threshold', rounds, softMax }
    }

    const excess = rounds - softKeep
    const oldLogs = takeOldestRawLogRounds(db, excess)
    if (oldLogs.length === 0) {
      return { ok: true, triggered: false, reason: 'empty', rounds, softMax }
    }

    const summaryId = input.summarySessionId.trim() || oldLogs[0]!.sessionId

    let scored: ScoredSummary
    try {
      scored = await summarizeLogsOrThrow(oldLogs)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      logWarn('memory', 'maybeConsolidateOnRoundCap LLM failed; skip prune', error)
      return { ok: false, reason: 'llm_failed', detail }
    }

    const { corePromoted, recordedSignificance } = applyScoredSummary(
      db,
      summaryId,
      oldLogs,
      scored
    )
    const pruned = pruneRawLogsToKeepRecentRounds(db, softKeep)
    logInfo(
      'memory',
      'maybeConsolidateOnRoundCap ok',
      `mode=${mode} roundsWas=${rounds} prunedRounds=${pruned.prunedRounds} keep=${softKeep}`
    )

    return {
      ok: true,
      triggered: true,
      summaryId,
      prunedRounds: pruned.prunedRounds,
      remainingRounds: pruned.remainingRounds,
      significance: recordedSignificance,
      corePromoted
    }
  } catch (error) {
    logWarn('memory', 'maybeConsolidateOnRoundCap failed', error)
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'error', detail }
  }
}
