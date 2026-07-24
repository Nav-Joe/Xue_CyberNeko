/** 核心池 / 总结共用的记忆衰减类型 */
export type MemoryKind = 'emotion_peak' | 'habit' | 'fact'

export const MEMORY_KIND_HALF_LIFE_DAYS: Record<MemoryKind, number> = {
  emotion_peak: 90,
  habit: 30,
  fact: 7
}

export const CORE_HIT_STRONG_DELTA = 2
export const CORE_HIT_WEAK_DELTA = 1
/** 满池竞赛：新记忆未衰减，乘以折扣后再比 */
export const CORE_PROMOTE_CONTEST_DISCOUNT = 0.7

export function parseMemoryKind(raw: unknown): MemoryKind {
  if (raw === 'emotion_peak' || raw === 'habit' || raw === 'fact') return raw
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase()
    if (t === 'emotion_peak' || t === 'emotion-peak' || t === 'peak') return 'emotion_peak'
    if (t === 'fact') return 'fact'
    if (t === 'habit') return 'habit'
  }
  return 'habit'
}

export function halfLifeDaysForKind(kind: MemoryKind | string): number {
  const k = parseMemoryKind(kind)
  return MEMORY_KIND_HALF_LIFE_DAYS[k]
}

/**
 * 活力系数（仅核心池）：
 * significance * exp(-days / halfLife) * (1 + log1p(hitCount * 2))
 */
export function computeVitality(input: {
  significance: number
  memoryKind: MemoryKind | string
  hitCount: number
  createdAt: Date | number
  nowMs?: number
}): number {
  const significance = Number.isFinite(input.significance) ? Math.max(0, input.significance) : 0
  const hitCount = Math.max(0, Math.floor(input.hitCount || 0))
  const createdMs =
    input.createdAt instanceof Date ? input.createdAt.getTime() : Number(input.createdAt)
  const now = input.nowMs ?? Date.now()
  const days = Math.max(0, (now - (Number.isFinite(createdMs) ? createdMs : now)) / 86_400_000)
  const halfLife = halfLifeDaysForKind(input.memoryKind)
  const decay = Math.exp(-days / halfLife)
  const hitBoost = 1 + Math.log1p(hitCount * 2)
  return significance * decay * hitBoost
}

export type CoreHitTier = 'strong' | 'weak' | 'none'

/** 匹配前归一化：小写、去空白与常见中英标点（类 RAG / 核心命中共用） */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(
      /[，。！？、；：""''「」『』（）【】[\](){}《》〈〉,.!?;:'"`~…·\-—_/\\|“”‘’–～]/g,
      ''
    )
}

/** 连续整串包含 → 强；滑动窗口 2–4 → 弱 */
export function matchContinuousOrSlidingWindow(hayRaw: string, needleRaw: string): CoreHitTier {
  const hay = normalizeForMatch(hayRaw)
  const needle = normalizeForMatch(needleRaw)
  if (!hay || !needle) return 'none'

  if (hay.includes(needle) || (needle.length >= 2 && needle.includes(hay))) {
    return 'strong'
  }

  if (needle.length < 2) return 'none'
  const maxWin = Math.min(4, needle.length)
  for (let len = maxWin; len >= 2; len -= 1) {
    for (let i = 0; i + len <= needle.length; i += 1) {
      if (hay.includes(needle.slice(i, i + len))) return 'weak'
    }
  }
  return 'none'
}

/** 对一条核心：keywords 走连续串+滑动窗口；长 content 仅强命中（避免全文 2 字窗口误伤） */
export function scoreCoreMemoryHit(
  userInput: string,
  keywords: string[],
  content: string
): CoreHitTier {
  let best: CoreHitTier = 'none'
  for (const kw of (keywords ?? []).map((k) => k.trim()).filter(Boolean)) {
    const tier = matchContinuousOrSlidingWindow(userInput, kw)
    if (tier === 'strong') return 'strong'
    if (tier === 'weak') best = 'weak'
  }
  const c = content.trim()
  if (!c) return best
  if (c.length <= 24) {
    const tier = matchContinuousOrSlidingWindow(userInput, c)
    if (tier === 'strong') return 'strong'
    if (tier === 'weak') best = 'weak'
    return best
  }
  const hay = normalizeForMatch(userInput)
  const needle = normalizeForMatch(c)
  if (hay && (hay.includes(needle) || (hay.length >= 2 && needle.includes(hay)))) {
    return 'strong'
  }
  return best
}

export function hitDeltaForTier(tier: CoreHitTier): number {
  if (tier === 'strong') return CORE_HIT_STRONG_DELTA
  if (tier === 'weak') return CORE_HIT_WEAK_DELTA
  return 0
}
