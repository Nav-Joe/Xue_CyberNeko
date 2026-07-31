/**
 * 解析 LLM 欲望提议并写库（LLM 不直接碰数据库）。
 */
import { applyDesireTurn, isDesireOpen } from './engine'
import { insertDesireForTest, saveDesireSnapshot } from './store'
import type { DesireSnapshot, DesireTurnOutcome } from './types'
import type { MemoryDatabase } from '../memory/dbCore'

export type DesireProposalAction = 'keep' | 'replace' | 'create' | 'fulfill' | 'abandon'

export type DesireProposalItem = {
  id: string | null
  action: DesireProposalAction
  name?: string
  description?: string
  intensity?: number
  patienceMax?: number
  outcome?: DesireTurnOutcome
}

export type DesireProposal = {
  desires: DesireProposalItem[]
}

const ACTIONS = new Set<DesireProposalAction>([
  'keep',
  'replace',
  'create',
  'fulfill',
  'abandon'
])

const OUTCOMES = new Set<DesireTurnOutcome>(['ignored', 'neutral', 'advanced', 'fulfilled', 'abandon'])

export function clampIntensity(n: unknown, fallback = 5): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(10, Math.max(0, Math.round(v * 10) / 10))
}

export function clampPatienceMax(n: unknown, fallback = 100): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(200, Math.max(1, Math.round(v)))
}

function asOutcome(raw: unknown): DesireTurnOutcome | undefined {
  if (typeof raw !== 'string') return undefined
  return OUTCOMES.has(raw as DesireTurnOutcome) ? (raw as DesireTurnOutcome) : undefined
}

function asAction(raw: unknown): DesireProposalAction | null {
  if (typeof raw !== 'string') return null
  return ACTIONS.has(raw as DesireProposalAction) ? (raw as DesireProposalAction) : null
}

/** 从 LLM 文本解析提议；失败返回 null（整包 noop） */
export function parseDesireProposal(raw: unknown): DesireProposal | null {
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
  const desiresRaw = (data as { desires?: unknown }).desires
  if (!Array.isArray(desiresRaw)) return null

  const desires: DesireProposalItem[] = []
  for (const row of desiresRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const action = asAction(r.action)
    if (!action) continue
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null
    const item: DesireProposalItem = {
      id,
      action,
      name: typeof r.name === 'string' ? r.name.trim() : undefined,
      description: typeof r.description === 'string' ? r.description.trim() : undefined,
      intensity: r.intensity !== undefined ? clampIntensity(r.intensity) : undefined,
      patienceMax: r.patienceMax !== undefined ? clampPatienceMax(r.patienceMax) : undefined,
      outcome: asOutcome(r.outcome)
    }
    desires.push(item)
  }
  return { desires }
}

export type ApplyDesireProposalResult = {
  touchedIds: string[]
  createdIds: string[]
  createSkippedExtra: number
}

/**
 * 执行提议。未出现在 JSON 中的 open 欲望默认 neutral 轻扣。
 * 单次 create 最多 1 条。
 */
export function applyDesireProposal(
  db: MemoryDatabase,
  open: DesireSnapshot[],
  proposal: DesireProposal,
  nowMs: number
): ApplyDesireProposalResult {
  const byId = new Map(open.map((d) => [d.id, d]))
  const mentioned = new Set<string>()
  const touchedIds: string[] = []
  const createdIds: string[] = []
  let createCount = 0
  let createSkippedExtra = 0

  const touch = (d: DesireSnapshot) => {
    touchedIds.push(d.id)
    saveDesireSnapshot(db, d)
    byId.set(d.id, d)
  }

  for (const item of proposal.desires) {
    if (item.action === 'create') {
      if (createCount >= 1) {
        createSkippedExtra += 1
        continue
      }
      const name = item.name?.trim()
      if (!name) continue
      const patienceMax = clampPatienceMax(item.patienceMax, 100)
      const created = insertDesireForTest(db, {
        name,
        description: item.description,
        intensity: clampIntensity(item.intensity, 5),
        patienceMax,
        patienceRemaining: patienceMax,
        nowMs
      })
      createCount += 1
      createdIds.push(created.id)
      byId.set(created.id, created)
      touchedIds.push(created.id)
      continue
    }

    if (!item.id) continue
    const current = byId.get(item.id)
    if (!current || !isDesireOpen(current.state)) continue
    mentioned.add(item.id)

    if (item.action === 'fulfill') {
      touch(applyDesireTurn(current, 'fulfilled', nowMs))
      continue
    }
    if (item.action === 'abandon') {
      touch(applyDesireTurn(current, 'abandon', nowMs))
      continue
    }

    if (item.action === 'replace') {
      const name = item.name?.trim()
      if (!name) continue
      const closed: DesireSnapshot = {
        ...current,
        state: 'replaced',
        protectionTurnsRemaining: 0,
        updatedAt: nowMs,
        lastInteractionAt: nowMs
      }
      saveDesireSnapshot(db, closed)
      byId.set(closed.id, closed)
      touchedIds.push(closed.id)

      if (createCount >= 1) {
        createSkippedExtra += 1
        continue
      }
      const patienceMax = clampPatienceMax(item.patienceMax, current.patienceMax)
      const created = insertDesireForTest(db, {
        name,
        description: item.description ?? current.description,
        intensity: clampIntensity(item.intensity, current.intensity),
        patienceMax,
        patienceRemaining: patienceMax,
        nowMs
      })
      createCount += 1
      createdIds.push(created.id)
      byId.set(created.id, created)
      touchedIds.push(created.id)
      continue
    }

    // 提议 action=keep：可改元数据后再按 outcome 结算
    let next: DesireSnapshot = { ...current }
    if (item.name?.trim()) next = { ...next, name: item.name.trim() }
    if (item.description !== undefined) next = { ...next, description: item.description }
    if (item.intensity !== undefined) next = { ...next, intensity: clampIntensity(item.intensity, next.intensity) }
    if (item.patienceMax !== undefined) {
      const patienceMax = clampPatienceMax(item.patienceMax, next.patienceMax)
      next = {
        ...next,
        patienceMax,
        patienceRemaining: Math.min(next.patienceRemaining, patienceMax)
      }
    }
    const outcome = item.outcome ?? 'neutral'
    if (outcome === 'fulfilled' || outcome === 'abandon') {
      touch(applyDesireTurn(next, outcome, nowMs))
    } else {
      touch(applyDesireTurn(next, outcome, nowMs))
    }
  }

  // 未提及的 open → neutral
  for (const d of open) {
    if (mentioned.has(d.id)) continue
    const latest = byId.get(d.id)
    if (!latest || !isDesireOpen(latest.state)) continue
    touch(applyDesireTurn(latest, 'neutral', nowMs))
  }

  return { touchedIds, createdIds, createSkippedExtra }
}
