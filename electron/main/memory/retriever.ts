import { desc } from 'drizzle-orm'

import type { MemoryDatabase } from './dbCore'
import { applyCoreMemoryHitsAndDecay, listCoreMemoriesForInject } from './corePool'
import { CHARS_PER_TOKEN_EST, OPENAI_MEMORY_BUDGET, type MemoryBudget } from './memoryBudgets'
import { periodSummaries, sessionSummaries } from './schema'
import { formatUserProfileBlock, getUserProfile } from './userProfile'
import {
  matchContinuousOrSlidingWindow,
  normalizeForMatch,
  type CoreHitTier
} from './vitality'

export { CHARS_PER_TOKEN_EST }
/** @deprecated 请用 memoryBudgetForMode(...).summaryMaxTokens；OpenAI 默认 */
export const MAX_SUMMARY_INJECT_TOKENS = OPENAI_MEMORY_BUDGET.summaryMaxTokens
/** 候选摘要扫描上限（再按相关度与分数排序后塞入 token 预算） */
export const SUMMARY_CANDIDATE_SCAN = 80
/** 回忆触发词：零命中时保底注入条数 */
export const RECALL_TRIGGER_FALLBACK_LIMIT = 2

/** 用户显式「想回忆」时的触发子串（归一化后 includes） */
export const RECALL_TRIGGER_PHRASES = ['记得', '上次', '以前', '那天', '之前'] as const

export type PromptMemoryContext = {
  coreMemories: Array<{ id: string; content: string; category: string; weight: number }>
  /** 用户画像纯文本块（不计入 summaryTokensUsed） */
  userProfileBlock: string
  summaries: Array<{
    id: string
    source: 'session' | 'period'
    kind?: 'weekly' | 'monthly'
    summary: string
    significance: number
    keywords: string[]
    keyFacts: string[]
    /** 本轮命中的 key_facts（优先注入） */
    matchedFacts: string[]
    /** 实际写入 block 的片段 */
    injectedFacts: string[]
    relevance: number
    score: number
  }>
  /** 总结记忆区块已用粗估 tokens（不含核心/画像） */
  summaryTokensUsed: number
}

export function estimateTokenCount(text: string): number {
  const n = text.trim().length
  if (n <= 0) return 0
  return Math.ceil(n / CHARS_PER_TOKEN_EST)
}

function timeDecay(startedAt: Date, nowMs: number): number {
  const ageDays = Math.max(0, (nowMs - startedAt.getTime()) / 86_400_000)
  return 1 / (1 + ageDays / 30)
}

export function hasRecallIntent(userInput: string): boolean {
  const hay = normalizeForMatch(userInput)
  if (!hay) return false
  return RECALL_TRIGGER_PHRASES.some((p) => hay.includes(normalizeForMatch(p)))
}

function tierWeight(tier: CoreHitTier, strong: number, weak: number): number {
  if (tier === 'strong') return strong
  if (tier === 'weak') return weak
  return 0
}

/**
 * 长 summary：整句落入 → 中档；用户侧 ≥3 字窗口落入 summary → 弱档（低于 key_facts）。
 * 短 summary（≤48）：与 keywords 同套连续串/滑窗。
 */
function scoreSummaryAgainstTurn(userInput: string, summary: string): number {
  const raw = summary.trim()
  if (!raw) return 0
  if (raw.length <= 48) {
    return tierWeight(matchContinuousOrSlidingWindow(userInput, raw), 0.75, 0.4)
  }
  const hay = normalizeForMatch(userInput)
  const sum = normalizeForMatch(raw)
  if (!hay || !sum) return 0
  if (sum.includes(hay) || (hay.length >= 2 && hay.includes(sum))) return 0.75
  if (hay.length < 3) return 0
  const maxWin = Math.min(4, hay.length)
  for (let len = maxWin; len >= 3; len -= 1) {
    for (let i = 0; i + len <= hay.length; i += 1) {
      if (sum.includes(hay.slice(i, i + len))) return 0.4
    }
  }
  return 0
}

/** 类 RAG：key_facts / keywords 同套连续串+滑窗；可选 summary 弱匹配 */
export function scoreRelevanceAgainstTurn(
  userInput: string,
  keyFacts: string[],
  keywords: string[],
  summary?: string
): { relevance: number; matchedFacts: string[] } {
  if (!normalizeForMatch(userInput)) return { relevance: 0, matchedFacts: [] }

  const matchedFacts: string[] = []
  let relevance = 0

  for (const fact of keyFacts) {
    const raw = fact.trim()
    if (!raw) continue
    const tier = matchContinuousOrSlidingWindow(userInput, raw)
    const w = tierWeight(tier, 2, 1)
    if (w <= 0) continue
    matchedFacts.push(raw)
    relevance += w
  }

  for (const kw of keywords) {
    const k = kw.trim()
    if (!k) continue
    relevance += tierWeight(matchContinuousOrSlidingWindow(userInput, k), 1.5, 0.75)
  }

  if (summary != null && summary.trim()) {
    relevance += scoreSummaryAgainstTurn(userInput, summary)
  }

  return { relevance, matchedFacts }
}

type RankedCandidate = {
  id: string
  source: 'session' | 'period'
  kind?: 'weekly' | 'monthly'
  summary: string
  significance: number
  keywords: string[]
  keyFacts: string[]
  matchedFacts: string[]
  relevance: number
  score: number
  startedAt: Date
}

function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.relevance !== a.relevance) return b.relevance - a.relevance
  if (b.significance !== a.significance) return b.significance - a.significance
  return b.startedAt.getTime() - a.startedAt.getTime()
}

function pickFactsForInject(row: RankedCandidate): string[] {
  if (row.matchedFacts.length > 0) return row.matchedFacts
  return row.keyFacts.filter((f) => f.trim()).slice(0, 5)
}

/**
 * L1 核心必带（条数/单条长度由 budget 决定：OpenAI 5×~300tok，本地 2×~100tok）。
 * 用户画像：非空则 100% 注入，不占 summary 预算。
 * L3：session/period 对 key_facts、keywords（同套滑窗）+ summary 弱匹配打分；
 * 主序 score=relevance×significance×decay；零命中且含回忆触发词时保底 1～2 条高分摘要。
 */
export function buildPromptMemoryContext(
  db: MemoryDatabase,
  input: {
    userInput: string
    nowMs?: number
    maxSummaryTokens?: number
    budget?: MemoryBudget
  }
): PromptMemoryContext {
  const budget = input.budget ?? OPENAI_MEMORY_BUDGET
  const nowMs = input.nowMs ?? Date.now()
  const maxTokens = input.maxSummaryTokens ?? budget.summaryMaxTokens

  // 本轮：核心池连续子串/滑动窗口命中加分 + 全池时间衰减写回 weight
  applyCoreMemoryHitsAndDecay(db, input.userInput, nowMs)

  const cores = listCoreMemoriesForInject(db, budget).map((row) => {
    const maxChars = budget.coreMaxChars
    const content =
      row.content.length <= maxChars
        ? row.content
        : `${row.content.slice(0, Math.max(0, maxChars - 1))}…`
    return {
      id: row.id,
      content,
      category: row.category,
      weight: row.weight
    }
  })

  const userProfileBlock = formatUserProfileBlock(getUserProfile(db))

  const sessionRows = db
    .select()
    .from(sessionSummaries)
    .orderBy(desc(sessionSummaries.startedAt))
    .limit(SUMMARY_CANDIDATE_SCAN)
    .all()

  const periodRows = db
    .select()
    .from(periodSummaries)
    .orderBy(desc(periodSummaries.periodStart))
    .limit(SUMMARY_CANDIDATE_SCAN)
    .all()

  const candidates: RankedCandidate[] = []

  for (const row of sessionRows) {
    const keywords = Array.isArray(row.keywords) ? row.keywords : []
    const keyFacts = Array.isArray(row.keyFacts) ? row.keyFacts : []
    const significance = typeof row.significance === 'number' ? row.significance : 0
    const { relevance, matchedFacts } = scoreRelevanceAgainstTurn(
      input.userInput,
      keyFacts,
      keywords,
      row.summary
    )
    const decay = timeDecay(row.startedAt, nowMs)
    const score = relevance <= 0 ? 0 : relevance * Math.max(0.1, significance) * decay
    candidates.push({
      id: row.id,
      source: 'session',
      summary: row.summary,
      significance,
      keywords,
      keyFacts,
      matchedFacts,
      relevance,
      score,
      startedAt: row.startedAt
    })
  }

  for (const row of periodRows) {
    const keywords = Array.isArray(row.keywords) ? row.keywords : []
    const keyFacts = Array.isArray(row.keyFacts) ? row.keyFacts : []
    const significance = typeof row.significance === 'number' ? row.significance : 0
    const { relevance, matchedFacts } = scoreRelevanceAgainstTurn(
      input.userInput,
      keyFacts,
      keywords,
      row.summary
    )
    const decay = timeDecay(row.periodStart, nowMs)
    const score = relevance <= 0 ? 0 : relevance * Math.max(0.1, significance) * decay
    const kind = row.kind === 'monthly' ? 'monthly' : 'weekly'
    candidates.push({
      id: row.id,
      source: 'period',
      kind,
      summary: row.summary,
      significance,
      keywords,
      keyFacts,
      matchedFacts,
      relevance,
      score,
      startedAt: row.periodStart
    })
  }

  let ranked = candidates.filter((r) => r.relevance > 0).sort(compareRanked)

  // 回忆触发且零命中：按 significance×decay 保底 1～2 条（仍注入其 key_facts）
  if (ranked.length === 0 && hasRecallIntent(input.userInput)) {
    ranked = [...candidates]
      .filter((r) => r.keyFacts.some((f) => f.trim()))
      .sort((a, b) => {
        const sa = Math.max(0.1, a.significance) * timeDecay(a.startedAt, nowMs)
        const sb = Math.max(0.1, b.significance) * timeDecay(b.startedAt, nowMs)
        if (sb !== sa) return sb - sa
        return b.startedAt.getTime() - a.startedAt.getTime()
      })
      .slice(0, RECALL_TRIGGER_FALLBACK_LIMIT)
      .map((r) => {
        const decay = timeDecay(r.startedAt, nowMs)
        const syntheticRel = 0.1
        return {
          ...r,
          relevance: syntheticRel,
          score: syntheticRel * Math.max(0.1, r.significance) * decay
        }
      })
  }

  const header = '【相关长期记忆｜key_facts 召回】'
  let used = estimateTokenCount(header)
  const picked: PromptMemoryContext['summaries'] = []

  for (const row of ranked) {
    if (used >= maxTokens) break
    const preferred = pickFactsForInject(row)
    if (preferred.length === 0) continue

    const injectedFacts: string[] = []
    for (const fact of preferred) {
      const line = `- ${fact.trim()}`
      const cost = estimateTokenCount(line)
      if (used + cost > maxTokens) break
      injectedFacts.push(fact.trim())
      used += cost
    }
    if (injectedFacts.length === 0) break
    picked.push({
      id: row.id,
      source: row.source,
      kind: row.kind,
      summary: row.summary,
      significance: row.significance,
      keywords: row.keywords,
      keyFacts: row.keyFacts,
      matchedFacts: row.matchedFacts,
      injectedFacts,
      relevance: row.relevance,
      score: row.score
    })
  }

  return {
    coreMemories: cores,
    userProfileBlock,
    summaries: picked,
    summaryTokensUsed: used
  }
}

/** 拼进 system 的纯文本块；无内容时返回空串。画像不占 summary 预算。 */
export function formatPromptMemoryBlock(ctx: PromptMemoryContext): string {
  const parts: string[] = []
  if (ctx.coreMemories.length > 0) {
    parts.push('【核心记忆｜务必记住，无论当前话题】')
    for (const c of ctx.coreMemories) {
      parts.push(`- (${c.category}) ${c.content}`)
    }
  }
  if (ctx.userProfileBlock.trim()) {
    parts.push(ctx.userProfileBlock.trim())
  }
  if (ctx.summaries.length > 0) {
    parts.push('【相关长期记忆｜key_facts 召回】')
    for (const s of ctx.summaries) {
      for (const fact of s.injectedFacts) {
        parts.push(`- ${fact}`)
      }
    }
  }
  return parts.join('\n')
}
