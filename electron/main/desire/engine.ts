/**
 * 欲望衰减引擎（纯函数）。
 * 混合时钟：对话轮主扣/补；墙钟仅重逢升血 + 保护期。intensity 不参与耐心变化。
 */
import {
  DESIRE_DELTA,
  DESIRE_PROMPT_TOP_N,
  DESIRE_PROTECTION_TURNS,
  DESIRE_REUNION_LIGHT_MS,
  DESIRE_REUNION_STRONG_MS,
  type DesireLifecycleState,
  type DesirePatienceStage,
  type DesireSnapshot,
  type DesireTurnOutcome
} from './types'

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function isDesireOpen(state: DesireLifecycleState): boolean {
  return state === 'active' || state === 'urgent'
}

export function patienceRatio(desire: Pick<DesireSnapshot, 'patienceMax' | 'patienceRemaining'>): number {
  if (desire.patienceMax <= 0) return 0
  return desire.patienceRemaining / desire.patienceMax
}

export function resolvePatienceStage(
  desire: Pick<DesireSnapshot, 'patienceMax' | 'patienceRemaining'>
): DesirePatienceStage {
  const r = patienceRatio(desire)
  if (desire.patienceRemaining <= 0 || r <= 0.2) return 'urgent'
  if (r <= 0.5) return 'restless'
  return 'calm'
}

/** 按 r / 保护期写回 active|urgent（终态不动） */
export function refreshOpenDesireState(desire: DesireSnapshot): DesireSnapshot {
  if (!isDesireOpen(desire.state)) return desire
  const stage = resolvePatienceStage(desire)
  if (desire.protectionTurnsRemaining > 0) {
    return { ...desire, state: 'active' }
  }
  return { ...desire, state: stage === 'urgent' ? 'urgent' : 'active' }
}

function applyPatienceDelta(desire: DesireSnapshot, deltaUnits: number, nowMs: number): DesireSnapshot {
  const d = desire.decayRate
  const next = clamp(
    desire.patienceRemaining + deltaUnits * d,
    0,
    Math.max(0, desire.patienceMax)
  )
  return {
    ...desire,
    patienceRemaining: next,
    updatedAt: nowMs,
    lastInteractionAt: nowMs
  }
}

export type SoftReunionResult = {
  desire: DesireSnapshot
  applied: 'none' | 'light' | 'strong'
}

/**
 * 墙钟软处理（只升不降）。按该条 lastInteractionAt 算 gap。
 * 轻/强缓冲均设置保护期 3 轮。
 */
export function softReunionDesire(desire: DesireSnapshot, nowMs: number): SoftReunionResult {
  if (!isDesireOpen(desire.state)) {
    return { desire, applied: 'none' }
  }
  const gap = Math.max(0, nowMs - desire.lastInteractionAt)
  if (gap < DESIRE_REUNION_LIGHT_MS) {
    return { desire, applied: 'none' }
  }

  const max = Math.max(0, desire.patienceMax)
  let patienceRemaining = desire.patienceRemaining
  let state: DesireLifecycleState = desire.state
  let applied: 'light' | 'strong'

  if (gap >= DESIRE_REUNION_STRONG_MS) {
    patienceRemaining = Math.min(max, Math.max(patienceRemaining, 0.45 * max))
    if (state === 'urgent') state = 'active'
    applied = 'strong'
  } else {
    patienceRemaining = Math.min(max, patienceRemaining + 0.15 * max)
    applied = 'light'
  }

  const next = refreshOpenDesireState({
    ...desire,
    patienceRemaining,
    state,
    protectionTurnsRemaining: DESIRE_PROTECTION_TURNS,
    lastTickAt: nowMs,
    updatedAt: nowMs
  })

  return { desire: next, applied }
}

export function softReunionDesires(
  desires: DesireSnapshot[],
  nowMs: number
): { desires: DesireSnapshot[]; appliedIds: string[] } {
  const appliedIds: string[] = []
  const next = desires.map((d) => {
    const r = softReunionDesire(d, nowMs)
    if (r.applied !== 'none') appliedIds.push(d.id)
    return r.desire
  })
  return { desires: next, appliedIds }
}

/**
 * 单条欲望结算一轮。fulfilled/abandon → 终态；否则先可假定调用方已 softReunion。
 */
export function applyDesireTurn(
  desire: DesireSnapshot,
  outcome: DesireTurnOutcome,
  nowMs: number
): DesireSnapshot {
  if (!isDesireOpen(desire.state)) return desire

  if (outcome === 'fulfilled') {
    return {
      ...desire,
      state: 'fulfilled',
      protectionTurnsRemaining: 0,
      updatedAt: nowMs,
      lastInteractionAt: nowMs,
      lastMentionedAt: nowMs
    }
  }
  if (outcome === 'abandon') {
    return {
      ...desire,
      state: 'abandoned',
      protectionTurnsRemaining: 0,
      updatedAt: nowMs,
      lastInteractionAt: nowMs
    }
  }

  const protectedTurn = desire.protectionTurnsRemaining > 0
  let deltaUnits: number
  if (outcome === 'ignored') {
    deltaUnits = protectedTurn ? DESIRE_DELTA.ignoredProtected : DESIRE_DELTA.ignored
  } else if (outcome === 'neutral') {
    deltaUnits = DESIRE_DELTA.neutral
  } else {
    deltaUnits = DESIRE_DELTA.advanced
  }

  let next = applyPatienceDelta(desire, deltaUnits, nowMs)
  if (protectedTurn) {
    next = {
      ...next,
      protectionTurnsRemaining: Math.max(0, desire.protectionTurnsRemaining - 1)
    }
  }
  return refreshOpenDesireState(next)
}

/** 多欲望各自 outcome，互不统一 */
export function applyDesireTurns(
  desires: DesireSnapshot[],
  outcomesById: Record<string, DesireTurnOutcome>,
  nowMs: number
): DesireSnapshot[] {
  return desires.map((d) => {
    const outcome = outcomesById[d.id]
    if (!outcome) return d
    return applyDesireTurn(d, outcome, nowMs)
  })
}

/**
 * 发消息前流水线：各条 softReunion →（可选）再 applyTurn。
 * 本函数只做 reunion；turn 由调用方按 LLM/测试传入 outcome 再调 applyDesireTurns。
 */
export function prepareDesiresForTurn(desires: DesireSnapshot[], nowMs: number): DesireSnapshot[] {
  return softReunionDesires(desires, nowMs).desires
}

function injectRank(desire: DesireSnapshot): number {
  const open = isDesireOpen(desire.state)
  if (!open) return Number.POSITIVE_INFINITY
  const urgentBoost = desire.state === 'urgent' ? 0 : 1000
  const r = patienceRatio(desire)
  return urgentBoost + r
}

/** Prompt 注入候选：urgent 优先，再按 r 升序，默认 Top-3 */
export function selectDesiresForPromptInject(
  desires: DesireSnapshot[],
  topN: number = DESIRE_PROMPT_TOP_N
): DesireSnapshot[] {
  return desires
    .filter((d) => isDesireOpen(d.state))
    .slice()
    .sort((a, b) => {
      const ra = injectRank(a)
      const rb = injectRank(b)
      if (ra !== rb) return ra - rb
      return b.intensity - a.intensity
    })
    .slice(0, Math.max(0, topN))
}
