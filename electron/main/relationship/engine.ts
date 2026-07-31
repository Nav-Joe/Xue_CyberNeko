/**
 * 三维好感纯函数引擎。
 * 分档 / clamp / 程度→Δ / 多维 apply；不读写 DB、无被动衰减。
 */
import {
  CLOSENESS_TAGS,
  RAPPORT_TAGS,
  REL_DELTA,
  REL_DIMENSIONS,
  REL_SCORE_MAX,
  REL_SCORE_MIN,
  TRUST_TAGS,
  type RelChange,
  type RelDimension,
  type RelEventDraft,
  type RelMagnitude,
  type RelScores,
  type RelStageTag
} from './types'

const DIMENSION_SET = new Set<string>(REL_DIMENSIONS)
const MAGNITUDE_SET = new Set<string>(Object.keys(REL_DELTA))

export function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(REL_SCORE_MAX, Math.max(REL_SCORE_MIN, v))
}

export function magnitudeToAbsDelta(magnitude: RelMagnitude): number {
  return REL_DELTA[magnitude]
}

/** 「正常」档：注入时可省略特殊关系语气 */
export function isNeutralStage(tag: string): boolean {
  return tag === '正常'
}

/**
 * 七档切点（默认 (L,R]；底端 ≤-7.5 含 -10 钉死最低档）。
 * 索引 0…6 对应各维 TAG 数组。
 */
export function stageBandIndex(score: number): number {
  const v = clampScore(score)
  if (v <= -7.5) return 0
  if (v <= -5) return 1
  if (v <= -2.5) return 2
  if (v <= 2.5) return 3
  if (v <= 5) return 4
  if (v <= 7.5) return 5
  return 6
}

export function resolveStageTag(dimension: RelDimension, score: number): RelStageTag {
  const i = stageBandIndex(score)
  if (dimension === 'closeness') return CLOSENESS_TAGS[i]
  if (dimension === 'trust') return TRUST_TAGS[i]
  return RAPPORT_TAGS[i]
}

export function resolveAllStageTags(scores: RelScores): Record<RelDimension, RelStageTag> {
  return {
    closeness: resolveStageTag('closeness', scores.closeness),
    trust: resolveStageTag('trust', scores.trust),
    rapport: resolveStageTag('rapport', scores.rapport)
  }
}

function isValidChange(change: RelChange): boolean {
  if (!DIMENSION_SET.has(change.dimension)) return false
  if (!MAGNITUDE_SET.has(change.magnitude)) return false
  if (change.sign !== 1 && change.sign !== -1) return false
  return true
}

export type ApplyRelationshipResult = {
  scores: RelScores
  /** 拟写流水：记**原始** delta（即使 clamp 后净变为 0） */
  events: RelEventDraft[]
}

/**
 * 多维同包改分。非法 dimension / magnitude / sign → **整条 skip**，不抛。
 * 事件记原始提议 delta，便于 24h 审计「顶满仍尝试」。
 */
export function applyRelationshipDeltas(
  scores: RelScores,
  changes: RelChange[]
): ApplyRelationshipResult {
  const next: RelScores = {
    closeness: clampScore(scores.closeness),
    trust: clampScore(scores.trust),
    rapport: clampScore(scores.rapport)
  }
  const events: RelEventDraft[] = []

  for (const change of changes) {
    if (!isValidChange(change)) continue
    const abs = magnitudeToAbsDelta(change.magnitude)
    const delta = change.sign * abs
    next[change.dimension] = clampScore(next[change.dimension] + delta)
    events.push({
      dimension: change.dimension,
      delta,
      magnitude: change.magnitude,
      reason: change.reason
    })
  }

  return { scores: next, events }
}
