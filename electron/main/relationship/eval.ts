/**
 * 好感鉴定编排：LLM 提议 → 本模块写库。
 * 由渲染侧后台调用，不阻塞发送 / 首 token。
 */
import type { MemoryDatabase } from '../memory/dbCore'
import { logInfo, logWarn } from '../logging/logger'
import { applyRelationshipProposal, parseRelationshipProposal } from './proposal'
import { requestRelationshipProposalLlm, type RelChatRound } from './relationshipLlm'
import { getRelationshipScores, type RelEventSource } from './store'

export type RelationshipEvalResult =
  | { ok: true; skipped?: string; applied?: number; scores?: ReturnType<typeof getRelationshipScores> }
  | { ok: false; detail: string }

export async function runRelationshipEval(
  db: MemoryDatabase,
  input: {
    rounds: RelChatRound[]
    source: RelEventSource
    nowMs?: number
  }
): Promise<RelationshipEvalResult> {
  const nowMs = input.nowMs ?? Date.now()
  const rounds = (input.rounds ?? [])
    .map((r) => ({
      userText: typeof r.userText === 'string' ? r.userText : '',
      assistantText: typeof r.assistantText === 'string' ? r.assistantText : ''
    }))
    .filter((r) => r.assistantText.trim())
  if (rounds.length === 0) return { ok: true, skipped: 'empty_rounds' }

  const scores = getRelationshipScores(db)
  const proposal = await requestRelationshipProposalLlm({ rounds, scores })
  if (!proposal) {
    return { ok: true, skipped: 'llm_failed_or_empty' }
  }

  try {
    const result = applyRelationshipProposal(db, proposal, input.source, nowMs)
    logInfo(
      'relationship',
      `eval applied=${result.applied} source=${input.source} rounds=${rounds.length}`
    )
    return { ok: true, applied: result.applied, scores: result.scores }
  } catch (error) {
    logWarn('relationship', 'applyRelationshipProposal failed', error)
    return { ok: false, detail: 'apply_failed' }
  }
}

/** 单测辅助：跳过 LLM，直接喂 JSON */
export function runRelationshipEvalWithParsed(
  db: MemoryDatabase,
  rawProposal: unknown,
  source: RelEventSource,
  nowMs = Date.now()
): RelationshipEvalResult {
  const proposal = parseRelationshipProposal(rawProposal)
  if (!proposal) return { ok: true, skipped: 'parse_failed' }
  try {
    const result = applyRelationshipProposal(db, proposal, source, nowMs)
    return { ok: true, applied: result.applied, scores: result.scores }
  } catch (error) {
    logWarn('relationship', 'runRelationshipEvalWithParsed failed', error)
    return { ok: false, detail: 'apply_failed' }
  }
}
