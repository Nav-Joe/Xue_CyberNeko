import { asc, eq, inArray } from 'drizzle-orm'

import type { MemoryDatabase } from './dbCore'
import { insertMemoryEvent } from './engine'
import { logInfo } from '../logging/logger'
import { memoryEvents, memoryMeta } from './schema'

/** memory_events.event_type：待消费的偷看标记（时间线隐蔽；下一轮 user 注入后删除） */
export const PEEK_EVENT_TYPE = 'peek'

/** 旧版 peek meta 键（实现改为 event 队列后一次性清掉，不再使用） */
const LEGACY_PEEK_META_KEYS = [
  'peek_active_until',
  'peek_count',
  'peek_access_log',
  'peek_last_at'
] as const

export type PeekResult = {
  recorded: true
  eventId: string
  atMs: number
  stamp: string
}

export type ConsumePeeksResult = {
  prefix: string
  count: number
  stamps: string[]
}

/** 本地时间戳 → `YYYY-MM-DD HH:mm` */
export function formatPeekAccessStamp(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatPeekUserInjectLine(atMs: number): string {
  return `【用户（${formatPeekAccessStamp(atMs)}）偷看了你的记忆和小心思】`
}

/** 拼到发给 LLM 的 user 内容前（多条换行）；前端不展示 */
export function formatPeekUserInjectPrefix(accessLogMs: number[]): string {
  const lines = accessLogMs
    .filter((x) => Number.isFinite(x) && x > 0)
    .map((ms) => formatPeekUserInjectLine(ms))
  return lines.join('\n')
}

/** 匹配 `【用户（…）偷看了你的记忆和小心思】`（整行） */
const PEEK_USER_INJECT_LINE_RE = /^【用户（[^】]*）偷看了你的记忆和小心思】\s*$/

/**
 * 写入 raw_logs 前剥离偷看注入行，避免污染摘要/召回。
 * 仅去掉正文开头连续的注入行；其余内容原样保留。
 */
export function stripPeekUserInjectPrefix(content: string): string {
  if (!content) return content
  const lines = content.split(/\r?\n/)
  let i = 0
  while (i < lines.length && PEEK_USER_INJECT_LINE_RE.test(lines[i]!.trim())) {
    i += 1
  }
  if (i === 0) return content
  return lines.slice(i).join('\n').replace(/^\n+/, '')
}

/** 清除旧版 peek 相关 memory_meta（若仍存在） */
export function purgeLegacyPeekMeta(db: MemoryDatabase): number {
  let n = 0
  for (const key of LEGACY_PEEK_META_KEYS) {
    const r = db.delete(memoryMeta).where(eq(memoryMeta.key, key)).run()
    n += Number(r.changes ?? 0)
  }
  return n
}

/** 打开记忆空间：写入一条待消费 peek 事件（不写 meta、不进 system） */
export function recordMemoryPeek(db: MemoryDatabase, now = Date.now()): PeekResult {
  purgeLegacyPeekMeta(db)
  const stamp = formatPeekAccessStamp(now)
  const { id } = insertMemoryEvent(db, {
    content: `peek:${now}`,
    layer: 'L3',
    significance: 0.85,
    arousal: 0.4,
    valence: -0.1,
    eventType: PEEK_EVENT_TYPE,
    createdAt: new Date(now)
  })
  logInfo('memory', 'peek marked for next user turn', `id=${id} stamp=${stamp}`)
  return { recorded: true, eventId: id, atMs: now, stamp }
}

/**
 * 下一轮对话前调用：取出全部待消费 peek → 拼 user 前缀 → 删除事件。
 * 无 pending 时 prefix 为空串。
 */
export function consumePendingPeeksForUserTurn(db: MemoryDatabase): ConsumePeeksResult {
  purgeLegacyPeekMeta(db)
  const rows = db
    .select()
    .from(memoryEvents)
    .where(eq(memoryEvents.eventType, PEEK_EVENT_TYPE))
    .orderBy(asc(memoryEvents.createdAt))
    .all()

  if (rows.length === 0) {
    return { prefix: '', count: 0, stamps: [] }
  }

  const stampsMs = rows.map((r) => r.createdAt.getTime())
  const stamps = stampsMs.map((ms) => formatPeekAccessStamp(ms))
  const prefix = formatPeekUserInjectPrefix(stampsMs)
  const ids = rows.map((r) => r.id)
  db.delete(memoryEvents).where(inArray(memoryEvents.id, ids)).run()
  logInfo('memory', 'peek consumed into user turn', `count=${ids.length}`)
  return { prefix, count: ids.length, stamps }
}
