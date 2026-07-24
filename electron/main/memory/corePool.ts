import { asc, desc, eq } from 'drizzle-orm'

import type { MemoryDatabase } from './dbCore'
import { newMemoryId } from './ids'
import { OPENAI_MEMORY_BUDGET, type MemoryBudget } from './memoryBudgets'
import { coreMemories } from './schema'
import {
  CORE_PROMOTE_CONTEST_DISCOUNT,
  computeVitality,
  hitDeltaForTier,
  parseMemoryKind,
  scoreCoreMemoryHit,
  type MemoryKind
} from './vitality'

/** @deprecated 请用 memoryBudgetForMode；保留 OpenAI 默认硬顶别名 */
export const CORE_POOL_MAX = OPENAI_MEMORY_BUDGET.corePoolMax
/** 进入核心池最低分（两档共用） */
export const CORE_POOL_MIN_SCORE = 9.5
/** @deprecated 请用 budget.coreMaxChars */
export const CORE_CONTENT_MAX_CHARS = OPENAI_MEMORY_BUDGET.coreMaxChars

export type CoreMemoryRow = {
  id: string
  category: string
  content: string
  /** 现算活力系数缓存 */
  weight: number
  significance: number
  memoryKind: MemoryKind
  hitCount: number
  keywords: string[]
  fixed: boolean
  createdAt: Date
  updatedAt: Date
  sourceSession: string | null
}

function mapCoreRow(row: typeof coreMemories.$inferSelect): CoreMemoryRow {
  return {
    id: row.id,
    category: row.category,
    content: row.content,
    weight: row.weight,
    significance: row.significance ?? 0,
    memoryKind: parseMemoryKind(row.memoryKind),
    hitCount: row.hitCount ?? 0,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    fixed: row.fixed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sourceSession: row.sourceSession
  }
}

export function listCoreMemories(db: MemoryDatabase): CoreMemoryRow[] {
  return db
    .select()
    .from(coreMemories)
    .orderBy(desc(coreMemories.weight), asc(coreMemories.createdAt))
    .all()
    .map(mapCoreRow)
}

/** 注入用：按 weight（活力缓存）取前 N 条 */
export function listCoreMemoriesForInject(
  db: MemoryDatabase,
  budget: MemoryBudget = OPENAI_MEMORY_BUDGET
): CoreMemoryRow[] {
  return listCoreMemories(db).slice(0, Math.max(0, budget.corePoolMax))
}

export function countCoreMemories(db: MemoryDatabase): number {
  return listCoreMemories(db).length
}

function truncateCoreContent(content: string, maxChars: number): string {
  const trimmed = content.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}…`
}

function liveVitality(row: CoreMemoryRow, nowMs: number): number {
  return computeVitality({
    significance: row.significance > 0 ? row.significance : row.weight,
    memoryKind: row.memoryKind,
    hitCount: row.hitCount,
    createdAt: row.createdAt,
    nowMs
  })
}

/**
 * 分数 ≥ 9.5 时尝试写入核心池。
 * 池未满则直接加入；已满则：新 vitality×0.7 与池内最低现算 vitality 竞赛（相等保留旧条）。
 */
export function tryPromoteToCorePool(
  db: MemoryDatabase,
  input: {
    content: string
    significance: number
    keywords?: string[]
    memoryKind?: MemoryKind | string
    sourceSession?: string | null
    category?: string
    budget?: MemoryBudget
    nowMs?: number
  }
): { promoted: boolean; reason: string; id?: string } {
  const budget = input.budget ?? OPENAI_MEMORY_BUDGET
  const nowMs = input.nowMs ?? Date.now()
  if (input.significance < CORE_POOL_MIN_SCORE) {
    return { promoted: false, reason: 'below_threshold' }
  }

  const content = truncateCoreContent(input.content, budget.coreMaxChars)
  if (!content) return { promoted: false, reason: 'empty_content' }

  const existing = listCoreMemories(db)
  if (existing.some((row) => row.content === content)) {
    return { promoted: false, reason: 'duplicate' }
  }

  const memoryKind = parseMemoryKind(input.memoryKind)
  const keywords = (input.keywords ?? [])
    .filter((x) => typeof x === 'string' && x.trim())
    .map((x) => x.trim().slice(0, 24))
    .slice(0, 8)
  const category =
    input.category?.trim() ||
    (keywords[0] ? keywords[0].slice(0, 40) : 'general')
  const now = new Date(nowMs)
  const significance = input.significance
  const entryVitality = computeVitality({
    significance,
    memoryKind,
    hitCount: 0,
    createdAt: now,
    nowMs
  })

  while (listCoreMemories(db).length > budget.corePoolMax) {
    const rows = listCoreMemories(db)
    let victim = rows.find((r) => !r.fixed)
    let lowest = victim ? liveVitality(victim, nowMs) : Infinity
    for (const row of rows) {
      if (row.fixed) continue
      const v = liveVitality(row, nowMs)
      if (v < lowest) {
        lowest = v
        victim = row
      }
    }
    if (!victim) break
    db.delete(coreMemories).where(eq(coreMemories.id, victim.id)).run()
  }

  const current = listCoreMemories(db)
  if (current.length < budget.corePoolMax) {
    const id = newMemoryId()
    db.insert(coreMemories)
      .values({
        id,
        category,
        content,
        weight: entryVitality,
        significance,
        memoryKind,
        hitCount: 0,
        keywords,
        fixed: false,
        createdAt: now,
        updatedAt: now,
        sourceSession: input.sourceSession ?? null
      })
      .run()
    return { promoted: true, reason: 'inserted', id }
  }

  const contestants = current.filter((r) => !r.fixed)
  if (contestants.length === 0) {
    return { promoted: false, reason: 'pool_full_fixed' }
  }

  let victim = contestants[0]!
  let lowestVitality = liveVitality(victim, nowMs)
  for (const row of contestants.slice(1)) {
    const v = liveVitality(row, nowMs)
    if (v < lowestVitality) {
      lowestVitality = v
      victim = row
    }
  }

  const candidate = entryVitality * CORE_PROMOTE_CONTEST_DISCOUNT
  if (candidate <= lowestVitality) {
    return { promoted: false, reason: 'weaker_than_pool' }
  }

  db.delete(coreMemories).where(eq(coreMemories.id, victim.id)).run()
  const id = newMemoryId()
  db.insert(coreMemories)
    .values({
      id,
      category,
      content,
      weight: entryVitality,
      significance,
      memoryKind,
      hitCount: 0,
      keywords,
      fixed: false,
      createdAt: now,
      updatedAt: now,
      sourceSession: input.sourceSession ?? null
    })
    .run()
  return { promoted: true, reason: 'replaced', id }
}

/**
 * 用户本轮发言：关键词命中加 hit，全池重算 vitality 写回 weight。
 * 返回本轮发生命中的条数。
 */
export function applyCoreMemoryHitsAndDecay(
  db: MemoryDatabase,
  userInput: string,
  nowMs = Date.now()
): { hitRows: number } {
  const rows = listCoreMemories(db)
  let hitRows = 0
  const now = new Date(nowMs)

  for (const row of rows) {
    const tier = scoreCoreMemoryHit(userInput, row.keywords, row.content)
    const delta = hitDeltaForTier(tier)
    const nextHit = row.hitCount + delta
    if (delta > 0) hitRows += 1
    const nextWeight = computeVitality({
      significance: row.significance > 0 ? row.significance : row.weight,
      memoryKind: row.memoryKind,
      hitCount: nextHit,
      createdAt: row.createdAt,
      nowMs
    })
    db.update(coreMemories)
      .set({
        hitCount: nextHit,
        weight: nextWeight,
        updatedAt: now
      })
      .where(eq(coreMemories.id, row.id))
      .run()
  }

  return { hitRows }
}
