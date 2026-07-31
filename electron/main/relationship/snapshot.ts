/**
 * 只读快照（当前分 / TAG / 今日净变化）。
 */
import type { MemoryDatabase } from '../memory/dbCore'
import { resolveAllStageTags } from './engine'
import { aggregateRelationshipNet, localDayBoundsMs, type RelNetByDimension } from './stats'
import { getRelationshipScores, listRelationshipEventsSince } from './store'
import type { RelDimension, RelScores, RelStageTag } from './types'

export type RelationshipSnapshot = {
  scores: RelScores
  tags: Record<RelDimension, RelStageTag>
  /** 今日（本地 0 点起）各维原始 delta 净和 */
  netToday: RelNetByDimension
}

export function buildRelationshipSnapshot(
  db: MemoryDatabase,
  nowMs = Date.now()
): RelationshipSnapshot {
  const scores = getRelationshipScores(db)
  const tags = resolveAllStageTags(scores)
  const { startMs } = localDayBoundsMs(nowMs)
  const events = listRelationshipEventsSince(db, startMs)
  const netToday = aggregateRelationshipNet(events, nowMs)
  return { scores, tags, netToday }
}
