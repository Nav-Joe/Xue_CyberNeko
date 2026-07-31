/**
 * 轮后编排：无活跃欲望时先做关键词门控，再调 LLM 提议，由本模块写库。
 */
import type { MemoryDatabase } from '../memory/dbCore'
import { logInfo, logWarn } from '../logging/logger'
import { requestDesireProposalLlm } from './desireLlm'
import { applyDesireProposal } from './proposal'
import { listOpenDesires } from './store'
import { shouldRunDesireLlmWhenEmpty } from './trigger'

export type DesireAfterTurnResult =
  | { ok: true; skipped?: string; createdIds?: string[]; touched?: number }
  | { ok: false; detail: string }

export async function runDesireAfterTurn(
  db: MemoryDatabase,
  input: { userText: string; assistantText: string; nowMs?: number }
): Promise<DesireAfterTurnResult> {
  const nowMs = input.nowMs ?? Date.now()
  const assistantText = input.assistantText.trim()
  if (!assistantText) return { ok: true, skipped: 'empty_assistant' }

  const open = listOpenDesires(db)
  if (open.length === 0 && !shouldRunDesireLlmWhenEmpty(assistantText)) {
    return { ok: true, skipped: 'b4_no_trigger' }
  }

  const proposal = await requestDesireProposalLlm({
    userText: input.userText,
    assistantText,
    open
  })
  if (!proposal) {
    return { ok: true, skipped: 'llm_failed_or_empty' }
  }

  try {
    const result = applyDesireProposal(db, open, proposal, nowMs)
    logInfo(
      'desire',
      `after-turn applied creates=${result.createdIds.length} touched=${result.touchedIds.length}`
    )
    return {
      ok: true,
      createdIds: result.createdIds,
      touched: result.touchedIds.length
    }
  } catch (error) {
    logWarn('desire', 'applyDesireProposal failed', error)
    return { ok: false, detail: 'apply_failed' }
  }
}
