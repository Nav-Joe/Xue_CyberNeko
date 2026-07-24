import { sql } from 'drizzle-orm'
import { blob, integer, real, sqliteTable, text, index } from 'drizzle-orm/sqlite-core'

/** L2→L3 会话摘要 */
export const sessionSummaries = sqliteTable('session_summaries', {
  id: text('id').primaryKey(),
  summary: text('summary').notNull().default(''),
  emotionTags: text('emotion_tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  keyFacts: text('key_facts', { mode: 'json' }).$type<string[]>().notNull().default([]),
  /** M4.2：情感/重要性 0–10；未打分前为 0 */
  significance: real('significance').notNull().default(0),
  /** M4.2：检索用短关键词（与 key_facts 要点分工） */
  keywords: text('keywords', { mode: 'json' }).$type<string[]>().notNull().default([]),
  /** 衰减类型：emotion_peak | habit | fact（入核心池时映射 halfLife） */
  memoryKind: text('memory_kind').notNull().default('habit'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  messageCount: integer('message_count').notNull().default(0)
})

/** L3 长期记忆事件 */
export const memoryEvents = sqliteTable(
  'memory_events',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id'),
    content: text('content').notNull(),
    layer: text('layer').notNull().default('L3'),
    significance: real('significance').notNull().default(0.5),
    arousal: real('arousal').notNull().default(0),
    valence: real('valence').notNull().default(0),
    eventType: text('event_type').notNull().default('general'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    accessedCount: integer('accessed_count').notNull().default(0),
    lastAccessed: integer('last_accessed', { mode: 'timestamp_ms' }),
    embedding: blob('embedding')
  },
  (table) => ({
    createdAtIdx: index('memory_events_created_at_idx').on(table.createdAt),
    eventTypeIdx: index('memory_events_event_type_idx').on(table.eventType),
    significanceIdx: index('memory_events_significance_idx').on(table.significance)
  })
)

/** L1 核心记忆池 */
export const coreMemories = sqliteTable(
  'core_memories',
  {
    id: text('id').primaryKey(),
    category: text('category').notNull().default('general'),
    content: text('content').notNull(),
    /** 现算活力系数缓存（非入池分快照） */
    weight: real('weight').notNull().default(1),
    /** 入池时的情感分（活力公式底数，写入后不变） */
    significance: real('significance').notNull().default(0),
    /** emotion_peak | habit | fact */
    memoryKind: text('memory_kind').notNull().default('habit'),
    hitCount: integer('hit_count').notNull().default(0),
    keywords: text('keywords', { mode: 'json' }).$type<string[]>().notNull().default([]),
    fixed: integer('fixed', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    sourceSession: text('source_session')
  },
  (table) => ({
    categoryIdx: index('core_memories_category_idx').on(table.category)
  })
)

/** 原始对话日志（滚动保留最近 3 个完整会话） */
export const rawLogs = sqliteTable('raw_logs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull()
})

/** 偷窥冷却等元数据（单行 key-value） */
export const memoryMeta = sqliteTable('memory_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch('now') * 1000 as integer))`)
})

/** M4.2.5：周/月周期摘要（L3，与 session_summaries 分表） */
export const periodSummaries = sqliteTable(
  'period_summaries',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    periodStart: integer('period_start', { mode: 'timestamp_ms' }).notNull(),
    periodEnd: integer('period_end', { mode: 'timestamp_ms' }).notNull(),
    summary: text('summary').notNull().default(''),
    emotionTags: text('emotion_tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    keyFacts: text('key_facts', { mode: 'json' }).$type<string[]>().notNull().default([]),
    significance: real('significance').notNull().default(0),
    keywords: text('keywords', { mode: 'json' }).$type<string[]>().notNull().default([]),
    memoryKind: text('memory_kind').notNull().default('habit'),
    sourceIds: text('source_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    kindIdx: index('period_summaries_kind_idx').on(table.kind),
    periodStartIdx: index('period_summaries_period_start_idx').on(table.periodStart)
  })
)

/** M4.2.5：全局用户画像（单行 id=default） */
export const userProfile = sqliteTable('user_profile', {
  id: text('id').primaryKey(),
  interests: text('interests').notNull().default(''),
  summary: text('summary').notNull().default(''),
  personality: text('personality').notNull().default(''),
  age: text('age').notNull().default('未知'),
  addressName: text('address_name').notNull().default('未知'),
  attitudeToNeko: text('attitude_to_neko').notNull().default(''),
  frequentBehaviors: text('frequent_behaviors', { mode: 'json' }).$type<string[]>().notNull().default([]),
  sourceWeeklyId: text('source_weekly_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export type SessionSummary = typeof sessionSummaries.$inferSelect
export type MemoryEvent = typeof memoryEvents.$inferSelect
export type CoreMemory = typeof coreMemories.$inferSelect
export type RawLog = typeof rawLogs.$inferSelect
export type PeriodSummary = typeof periodSummaries.$inferSelect
export type UserProfileRow = typeof userProfile.$inferSelect
