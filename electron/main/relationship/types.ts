/** 三维好感纯函数类型（与 relationship_states 对齐；纯类型，读写在 store） */

export type RelDimension = 'closeness' | 'trust' | 'rapport'

/** LLM / 调用方程度档 → 绝对 Δ */
export type RelMagnitude = 'micro' | 'medium' | 'high' | 'extreme'

export type RelScores = {
  closeness: number
  trust: number
  rapport: number
}

export type RelChange = {
  dimension: RelDimension
  /** +1 加分 / -1 扣分 */
  sign: 1 | -1
  magnitude: RelMagnitude
  reason?: string
}

/** apply 产出的拟写事件（写入 relationship_events；记原始 delta，非 clamp 净变） */
export type RelEventDraft = {
  dimension: RelDimension
  delta: number
  magnitude: RelMagnitude
  reason?: string
}

export const REL_SCORE_MIN = -10
export const REL_SCORE_MAX = 10

export const REL_DELTA = {
  micro: 0.01,
  medium: 0.05,
  high: 0.1,
  extreme: 0.5
} as const satisfies Record<RelMagnitude, number>

export const REL_DIMENSIONS = ['closeness', 'trust', 'rapport'] as const

/** 亲近七档 TAG（低→高） */
export const CLOSENESS_TAGS = [
  '厌恶',
  '疏远',
  '冷淡',
  '正常',
  '友好',
  '亲近',
  '爱意'
] as const

/** 信任七档 TAG（低→高） */
export const TRUST_TAGS = [
  '心存芥蒂',
  '满腹狐疑',
  '半信半疑',
  '正常',
  '信任',
  '开诚相见',
  '毫不怀疑'
] as const

/** 投契七档 TAG（低→高） */
export const RAPPORT_TAGS = [
  '毫无交集',
  '不合',
  '尴尬',
  '正常',
  '融洽',
  '意气相投',
  '灵魂双子'
] as const

export type ClosenessTag = (typeof CLOSENESS_TAGS)[number]
export type TrustTag = (typeof TRUST_TAGS)[number]
export type RapportTag = (typeof RAPPORT_TAGS)[number]
export type RelStageTag = ClosenessTag | TrustTag | RapportTag
