import { desc, eq } from 'drizzle-orm'

import type { MemoryDatabase } from './dbCore'
import { coreMemories, periodSummaries, sessionSummaries } from './schema'

/**
 * 记忆空间时间线（只读 UI）。
 * L1=核心池 · L2=日常会话总结 · L3=周/月 period（不再展示 memory_events）。
 */
export type TimelineItem =
  | {
      kind: 'summary'
      id: string
      summary: string
      keyFacts: string[]
      emotionTags: string[]
      significance: number
      keywords: string[]
      source?: 'chat' | 'companion'
      sourceLabel?: string | null
      startedAt: number
      endedAt: number | null
      messageCount: number
    }
  | {
      kind: 'period'
      id: string
      periodKind: 'weekly' | 'monthly'
      summary: string
      keyFacts: string[]
      emotionTags: string[]
      significance: number
      keywords: string[]
      periodStart: number
      periodEnd: number
    }
  | {
      kind: 'core'
      id: string
      category: string
      content: string
      /** 活力系数缓存 */
      weight: number
      fixed: boolean
      updatedAt: number
    }

export function listTimeline(
  db: MemoryDatabase,
  options?: { layer?: string; limit?: number }
): TimelineItem[] {
  const limit = options?.limit ?? 80
  const layer = options?.layer

  const cores =
    !layer || layer === 'L1'
      ? db
          .select()
          .from(coreMemories)
          .orderBy(desc(coreMemories.weight), desc(coreMemories.updatedAt))
          .limit(20)
          .all()
          .map(
            (row): TimelineItem => ({
              kind: 'core',
              id: row.id,
              category: row.category,
              content: row.content,
              weight: row.weight,
              fixed: row.fixed,
              updatedAt: row.updatedAt.getTime()
            })
          )
      : []

  const summaries =
    !layer || layer === 'L2'
      ? db
          .select()
          .from(sessionSummaries)
          .orderBy(desc(sessionSummaries.startedAt))
          .limit(limit)
          .all()
          .map(
            (row): TimelineItem => ({
              kind: 'summary',
              id: row.id,
              summary: row.summary,
              keyFacts: row.keyFacts,
              emotionTags: row.emotionTags,
              significance: row.significance ?? 0,
              keywords: row.keywords ?? [],
              source: row.source === 'companion' ? 'companion' : 'chat',
              sourceLabel: row.sourceLabel ?? null,
              startedAt: row.startedAt.getTime(),
              endedAt: row.endedAt ? row.endedAt.getTime() : null,
              messageCount: row.messageCount
            })
          )
      : []

  const periods =
    !layer || layer === 'L3'
      ? db
          .select()
          .from(periodSummaries)
          .orderBy(desc(periodSummaries.periodStart))
          .limit(limit)
          .all()
          .map((row): TimelineItem => {
            const periodKind = row.kind === 'monthly' ? 'monthly' : 'weekly'
            return {
              kind: 'period',
              id: row.id,
              periodKind,
              summary: row.summary,
              keyFacts: row.keyFacts ?? [],
              emotionTags: row.emotionTags ?? [],
              significance: row.significance ?? 0,
              keywords: row.keywords ?? [],
              periodStart: row.periodStart.getTime(),
              periodEnd: row.periodEnd.getTime()
            }
          })
      : []

  // L3：保持周/月分区顺序由前端拆框；此处按时间混排供「全部」与单层使用
  if (layer === 'L3') {
    return periods.slice(0, limit)
  }
  if (layer === 'L1') return cores.slice(0, limit)
  if (layer === 'L2') return summaries.slice(0, limit)

  const merged: TimelineItem[] = [...cores, ...summaries, ...periods]
  merged.sort((a, b) => timelineSortKey(b) - timelineSortKey(a))
  return merged.slice(0, limit)
}

function timelineSortKey(item: TimelineItem): number {
  if (item.kind === 'core') return item.updatedAt
  if (item.kind === 'summary') return item.startedAt
  return item.periodStart
}

/** @deprecated 事件层已移出记忆空间；保留符号避免旧引用炸裂 */
export function listPeriodSummariesByKind(
  db: MemoryDatabase,
  kind: 'weekly' | 'monthly',
  limit = 40
): TimelineItem[] {
  return db
    .select()
    .from(periodSummaries)
    .where(eq(periodSummaries.kind, kind))
    .orderBy(desc(periodSummaries.periodStart))
    .limit(limit)
    .all()
    .map(
      (row): TimelineItem => ({
        kind: 'period',
        id: row.id,
        periodKind: kind,
        summary: row.summary,
        keyFacts: row.keyFacts ?? [],
        emotionTags: row.emotionTags ?? [],
        significance: row.significance ?? 0,
        keywords: row.keywords ?? [],
        periodStart: row.periodStart.getTime(),
        periodEnd: row.periodEnd.getTime()
      })
    )
}
