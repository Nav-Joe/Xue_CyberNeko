/**
 * 解析 LLM 好感提议并写库（LLM 不直接碰 DB）。
 * 同维多条允许叠加；非法 dim/magnitude/sign 整条 skip。
 */
import { applyRelationshipDeltas } from './engine'
import {
  getRelationshipScores,
  insertRelationshipEvents,
  saveRelationshipScores,
  type RelEventSource
} from './store'
import type { RelChange, RelDimension, RelMagnitude } from './types'
import type { MemoryDatabase } from '../memory/dbCore'

export type RelationshipProposal = {
  changes: RelChange[]
}

const DIMENSIONS = new Set<string>(['closeness', 'trust', 'rapport'])
const MAGNITUDES = new Set<string>(['micro', 'medium', 'high', 'extreme'])

function asDimension(raw: unknown): RelDimension | null {
  if (typeof raw !== 'string') return null
  return DIMENSIONS.has(raw) ? (raw as RelDimension) : null
}

function asMagnitude(raw: unknown): RelMagnitude | null {
  if (typeof raw !== 'string') return null
  return MAGNITUDES.has(raw) ? (raw as RelMagnitude) : null
}

function asSign(raw: unknown): 1 | -1 | null {
  if (raw === 1 || raw === -1) return raw
  if (raw === '1' || raw === '+1') return 1
  if (raw === '-1') return -1
  return null
}

/** 从 LLM 文本/对象解析；失败返回 null（整包 noop） */
export function parseRelationshipProposal(raw: unknown): RelationshipProposal | null {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      const trimmed = raw.trim()
      const start = trimmed.indexOf('{')
      const end = trimmed.lastIndexOf('}')
      data = JSON.parse(start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const changesRaw = (data as { changes?: unknown }).changes
  if (!Array.isArray(changesRaw)) return null

  const changes: RelChange[] = []
  for (const row of changesRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const dimension = asDimension(r.dimension)
    const magnitude = asMagnitude(r.magnitude)
    const sign = asSign(r.sign)
    if (!dimension || !magnitude || !sign) continue
    const reason = typeof r.reason === 'string' ? r.reason.trim().slice(0, 200) : undefined
    changes.push({
      dimension,
      sign,
      magnitude,
      reason: reason || undefined
    })
  }
  return { changes }
}

export type ApplyRelationshipProposalResult = {
  applied: number
  scores: ReturnType<typeof getRelationshipScores>
}

/**
 * 应用提议：引擎 apply（同维可叠）→ 写分 → 事件记原始 delta。
 * 空 changes 仍算成功（本窗无调分）。
 */
export function applyRelationshipProposal(
  db: MemoryDatabase,
  proposal: RelationshipProposal,
  source: RelEventSource,
  nowMs = Date.now()
): ApplyRelationshipProposalResult {
  const before = getRelationshipScores(db)
  const { scores, events } = applyRelationshipDeltas(before, proposal.changes)
  saveRelationshipScores(db, scores, nowMs)
  insertRelationshipEvents(db, events, source, nowMs)
  return {
    applied: events.length,
    scores
  }
}
