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
  /** 来源：普通聊天 chat，或屏幕偷窥 companion */
  source: text('source').notNull().default('chat'),
  /** 陪玩时记下游戏名，方便记忆空间展示 */
  sourceLabel: text('source_label'),
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

/** 欲望状态（可并行多条；intensity 与 patience 解耦；混合时钟） */
export const desireStates = sqliteTable(
  'desire_states',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** 欲望强度 0～10；与 patience_* 无自动换算关系 */
    intensity: real('intensity').notNull().default(0),
    /** 忍耐上限（语境/LLM 可调） */
    patienceMax: real('patience_max').notNull().default(100),
    /** 当前忍耐剩余（默认由引擎按混合时钟扣减） */
    patienceRemaining: real('patience_remaining').notNull().default(100),
    /** active | urgent | fulfilled | abandoned | replaced */
    state: text('state').notNull().default('active'),
    /** 轮衰减倍率 d；Δ 为纯常数 × d */
    decayRate: real('decay_rate').notNull().default(1),
    /** 重逢保护期剩余对话轮；>0 时 ignored 仅 -0.5d 且禁止 urgent */
    protectionTurnsRemaining: integer('protection_turns_remaining').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    /** 墙钟软处理锚点（长缺席重逢缓冲等；非主衰减） */
    lastTickAt: integer('last_tick_at', { mode: 'timestamp_ms' }).notNull(),
    /** 对话轮/有效互动锚点（主衰减） */
    lastInteractionAt: integer('last_interaction_at', { mode: 'timestamp_ms' }).notNull(),
    lastMentionedAt: integer('last_mentioned_at', { mode: 'timestamp_ms' }),
    deadline: integer('deadline', { mode: 'timestamp_ms' })
  },
  (table) => ({
    stateIdx: index('desire_states_state_idx').on(table.state)
  })
)

/** 三维好感当前分（全局单行 id=default） */
export const relationshipStates = sqliteTable('relationship_states', {
  id: text('id').primaryKey(),
  /** 亲近 -10～+10 */
  closeness: real('closeness').notNull().default(0),
  /** 信任 -10～+10 */
  trust: real('trust').notNull().default(0),
  /** 投契 -10～+10 */
  rapport: real('rapport').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

/** 好感分数变更事件流水（今日净变化等统计用） */
export const relationshipEvents = sqliteTable(
  'relationship_events',
  {
    id: text('id').primaryKey(),
    /** closeness | trust | rapport */
    dimension: text('dimension').notNull(),
    delta: real('delta').notNull(),
    /** micro | medium | high | extreme（可选） */
    magnitude: text('magnitude'),
    /** llm_turn | chat_close | 后续行为… */
    source: text('source').notNull().default('llm_turn'),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    createdAtIdx: index('relationship_events_created_at_idx').on(table.createdAt),
    dimensionCreatedAtIdx: index('relationship_events_dimension_created_at_idx').on(
      table.dimension,
      table.createdAt
    )
  })
)

/** 摸摸计数：按本地日历日一行；再用 affection_grants 封顶加亲近 */
export const petTouchDaily = sqliteTable('pet_touch_daily', {
  /** 本地日 YYYY-MM-DD */
  dayKey: text('day_key').primaryKey(),
  head: integer('head').notNull().default(0),
  arms: integer('arms').notNull().default(0),
  body: integer('body').notNull().default(0),
  legs: integer('legs').notNull().default(0),
  tail: integer('tail').notNull().default(0),
  /** 当日已授予亲近次数（0～10）；加亲近时递增 */
  affectionGrants: integer('affection_grants').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export type SessionSummary = typeof sessionSummaries.$inferSelect
export type MemoryEvent = typeof memoryEvents.$inferSelect
export type CoreMemory = typeof coreMemories.$inferSelect
export type RawLog = typeof rawLogs.$inferSelect
export type PeriodSummary = typeof periodSummaries.$inferSelect
export type UserProfileRow = typeof userProfile.$inferSelect
export type DesireState = typeof desireStates.$inferSelect
export type RelationshipState = typeof relationshipStates.$inferSelect
export type RelationshipEvent = typeof relationshipEvents.$inferSelect
export type PetTouchDaily = typeof petTouchDaily.$inferSelect
