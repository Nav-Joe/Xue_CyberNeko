import { asc, desc, eq, inArray, sql } from 'drizzle-orm'

import type { ChatHistoryMessage } from '../../../src/services/chat/types'
import { trimHistoryToRounds } from '../../../src/services/chat/historyWindow'
import type { MemoryDatabase } from './dbCore'
import { newMemoryId } from './ids'
import { stripPeekUserInjectPrefix } from './peek'
import { memoryEvents, rawLogs, sessionSummaries } from './schema'
import { parseMemoryKind, type MemoryKind } from './vitality'

export type { TimelineItem } from './timeline'
export { listTimeline } from './timeline'

export const MAX_RAW_SESSIONS = 3

export type RawLogRole = 'user' | 'assistant' | 'system'

export function appendRawLog(
  db: MemoryDatabase,
  input: { sessionId: string; role: RawLogRole; content: string; timestamp?: Date }
): { id: string } {
  const id = newMemoryId()
  const timestamp = input.timestamp ?? new Date()
  // user：剥离偷看注入前缀，只落前端可见正文（防污染 raw_logs / 摘要）
  const content =
    input.role === 'user' ? stripPeekUserInjectPrefix(input.content) : input.content
  db.insert(rawLogs)
    .values({
      id,
      sessionId: input.sessionId,
      role: input.role,
      content,
      timestamp
    })
    .run()
  return { id }
}

/** 超过 MAX_RAW_SESSIONS 个完整会话时，删除最旧会话的 raw_logs（摘要/事件已落库则保留） */
export function pruneRawLogsBeyondSessionLimit(db: MemoryDatabase, limit = MAX_RAW_SESSIONS): string[] {
  const sessionRows = db
    .select({ sessionId: rawLogs.sessionId })
    .from(rawLogs)
    .groupBy(rawLogs.sessionId)
    .orderBy(asc(sql`min(${rawLogs.timestamp})`))
    .all()

  if (sessionRows.length <= limit) return []

  const toDrop = sessionRows.slice(0, sessionRows.length - limit).map((r) => r.sessionId)
  db.delete(rawLogs).where(inArray(rawLogs.sessionId, toDrop)).run()
  return toDrop
}

export function listRawLogsForSession(
  db: MemoryDatabase,
  sessionId: string
): Array<{ id: string; role: string; content: string; timestamp: Date }> {
  return db
    .select({
      id: rawLogs.id,
      role: rawLogs.role,
      content: rawLogs.content,
      timestamp: rawLogs.timestamp
    })
    .from(rawLogs)
    .where(eq(rawLogs.sessionId, sessionId))
    .orderBy(asc(rawLogs.timestamp))
    .all()
}

/**
 * 全局按时间取最近 limitMessages 条 raw_logs，返回 ASC（旧→新），供切轮截断。
 */
export function listRecentRawLogs(
  db: MemoryDatabase,
  limitMessages: number
): Array<{ id: string; role: string; content: string; timestamp: Date }> {
  const limit = Math.max(1, Math.floor(limitMessages))
  const newestFirst = db
    .select({
      id: rawLogs.id,
      role: rawLogs.role,
      content: rawLogs.content,
      timestamp: rawLogs.timestamp
    })
    .from(rawLogs)
    .orderBy(desc(rawLogs.timestamp))
    .limit(limit)
    .all()
  return newestFirst.reverse()
}

/** 为 LLM 拉取最近 maxRounds 轮（复用 historyWindow 切轮）；跨 session，按 timestamp。 */
export function getRecentHistoryForPrompt(
  db: MemoryDatabase,
  maxRounds: number
): ChatHistoryMessage[] {
  if (maxRounds <= 0) return []
  const limitMessages = Math.max(80, maxRounds * 4)
  const logs = listRecentRawLogs(db, limitMessages)
  const history: ChatHistoryMessage[] = []
  for (const row of logs) {
    if (row.role !== 'user' && row.role !== 'assistant') continue
    const content = row.content.trim()
    if (!content) continue
    history.push({ role: row.role, content: row.content })
  }
  return trimHistoryToRounds(history, maxRounds)
}

export function listDistinctRawSessionIds(db: MemoryDatabase): string[] {
  return db
    .select({ sessionId: rawLogs.sessionId })
    .from(rawLogs)
    .groupBy(rawLogs.sessionId)
    .orderBy(desc(sql`max(${rawLogs.timestamp})`))
    .all()
    .map((r) => r.sessionId)
}

export function getSessionSummary(
  db: MemoryDatabase,
  id: string
): {
  id: string
  summary: string
  emotionTags: string[]
  keyFacts: string[]
  significance: number
  keywords: string[]
  memoryKind: MemoryKind
  startedAt: Date
  endedAt: Date | null
  messageCount: number
} | undefined {
  const row = db.select().from(sessionSummaries).where(eq(sessionSummaries.id, id)).get()
  if (!row) return undefined
  return {
    id: row.id,
    summary: row.summary,
    emotionTags: row.emotionTags,
    keyFacts: row.keyFacts,
    significance: row.significance,
    keywords: row.keywords,
    memoryKind: parseMemoryKind(row.memoryKind),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    messageCount: row.messageCount
  }
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const key = raw.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

/**
 * 写入会话摘要：若该 session 已有摘要则**累积**（拼接 summary、合并 key_facts / emotion_tags），不覆盖替换。
 */
export function accumulateSessionSummary(
  db: MemoryDatabase,
  input: {
    id: string
    summary: string
    emotionTags?: string[]
    keyFacts?: string[]
    memoryKind?: MemoryKind | string
    startedAt: Date
    endedAt?: Date | null
    messageCount: number
  }
): void {
  const existing = getSessionSummary(db, input.id)
  const memoryKind = parseMemoryKind(input.memoryKind)
  if (!existing) {
    db.insert(sessionSummaries)
      .values({
        id: input.id,
        summary: input.summary,
        emotionTags: input.emotionTags ?? [],
        keyFacts: input.keyFacts ?? [],
        memoryKind,
        startedAt: input.startedAt,
        endedAt: input.endedAt ?? null,
        messageCount: input.messageCount
      })
      .run()
    return
  }

  const nextSummary = existing.summary.trim()
    ? `${existing.summary.trim()}\n---\n${input.summary.trim()}`
    : input.summary.trim()
  const nextFacts = dedupeStrings([...(existing.keyFacts ?? []), ...(input.keyFacts ?? [])]).slice(
    0,
    24
  )
  const nextTags = dedupeStrings([
    ...(existing.emotionTags ?? []),
    ...(input.emotionTags ?? [])
  ]).slice(0, 16)
  // 累积时优先保留 emotion_peak
  const nextKind =
    existing.memoryKind === 'emotion_peak' || memoryKind === 'emotion_peak'
      ? 'emotion_peak'
      : memoryKind

  db.update(sessionSummaries)
    .set({
      summary: nextSummary.slice(0, 4000),
      keyFacts: nextFacts,
      emotionTags: nextTags,
      memoryKind: nextKind,
      endedAt: input.endedAt ?? existing.endedAt,
      messageCount: Math.max(existing.messageCount, input.messageCount)
    })
    .where(eq(sessionSummaries.id, input.id))
    .run()
}

/** 更新摘要的情感分与关键词；significance 取与已有值的较大者，keywords 去重合并。 */
export function updateSessionSummaryScore(
  db: MemoryDatabase,
  input: {
    id: string
    significance: number
    keywords: string[]
    memoryKind?: MemoryKind | string
  }
): void {
  const existing = getSessionSummary(db, input.id)
  if (!existing) return
  const nextKeywords = dedupeStrings([...(existing.keywords ?? []), ...input.keywords]).slice(0, 16)
  const nextKind = input.memoryKind
    ? existing.memoryKind === 'emotion_peak' || parseMemoryKind(input.memoryKind) === 'emotion_peak'
      ? 'emotion_peak'
      : parseMemoryKind(input.memoryKind)
    : existing.memoryKind
  db.update(sessionSummaries)
    .set({
      significance: Math.max(existing.significance ?? 0, input.significance),
      keywords: nextKeywords,
      memoryKind: nextKind
    })
    .where(eq(sessionSummaries.id, input.id))
    .run()
}

/** @deprecated 请用 accumulateSessionSummary；保留别名避免外部旧引用 */
export function upsertSessionSummary(
  db: MemoryDatabase,
  input: {
    id: string
    summary: string
    emotionTags?: string[]
    keyFacts?: string[]
    startedAt: Date
    endedAt?: Date | null
    messageCount: number
  }
): void {
  accumulateSessionSummary(db, input)
}

export function insertMemoryEvent(
  db: MemoryDatabase,
  input: {
    sessionId?: string | null
    content: string
    layer?: string
    significance?: number
    arousal?: number
    valence?: number
    eventType?: string
    createdAt?: Date
  }
): { id: string } {
  const id = newMemoryId()
  db.insert(memoryEvents)
    .values({
      id,
      sessionId: input.sessionId ?? null,
      content: input.content,
      layer: input.layer ?? 'L3',
      significance: input.significance ?? 0.5,
      arousal: input.arousal ?? 0,
      valence: input.valence ?? 0,
      eventType: input.eventType ?? 'general',
      createdAt: input.createdAt ?? new Date(),
      accessedCount: 0,
      lastAccessed: null,
      embedding: null
    })
    .run()
  return { id }
}

export function countRawLogs(db: MemoryDatabase): number {
  const row = db.select({ n: sql<number>`count(*)` }).from(rawLogs).all()[0]
  return Number(row?.n ?? 0)
}
