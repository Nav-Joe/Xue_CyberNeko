import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { eq, lt } from 'drizzle-orm'

import { describeMemoryDb } from './sqliteProbe'

describeMemoryDb('periodRollup', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function openDb() {
    const { openMemoryDbAt } = await import('../dbCore')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-period-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()
    return opened.db
  }

  it('does not delete session_summaries when weekly LLM fails', async () => {
    const db = await openDb()
    const { accumulateSessionSummary } = await import('../engine')
    const { sessionSummaries } = await import('../schema')
    const { maybeRunPeriodRollups } = await import('../periodRollup')
    const llm = await import('../periodSummarizeLlm')

    const today = new Date(2026, 6, 20)
    accumulateSessionSummary(db, {
      id: 'ss-old',
      summary: '旧会话',
      keyFacts: ['事实A'],
      startedAt: new Date(2026, 6, 10),
      endedAt: new Date(2026, 6, 10),
      messageCount: 2
    })

    vi.spyOn(llm, 'summarizePeriodWithLlm').mockRejectedValue(new Error('llm down'))

    const result = await maybeRunPeriodRollups(db, today)
    expect(result.weeklyDone).toBe(0)
    const left = db.select().from(sessionSummaries).all()
    expect(left).toHaveLength(1)
    expect(left[0]!.id).toBe('ss-old')
  })

  it('after weekly success keeps only last 2 calendar days of raw_logs', async () => {
    const db = await openDb()
    const { accumulateSessionSummary, appendRawLog } = await import('../engine')
    const { periodSummaries, rawLogs, sessionSummaries } = await import('../schema')
    const { maybeRunPeriodRollups, pruneRawLogsKeepRecentCalendarDays } = await import(
      '../periodRollup'
    )
    const llm = await import('../periodSummarizeLlm')

    const today = new Date(2026, 6, 20, 12, 0, 0)
    accumulateSessionSummary(db, {
      id: 'ss1',
      summary: '一周前',
      keyFacts: ['周事实'],
      startedAt: new Date(2026, 6, 12),
      endedAt: new Date(2026, 6, 12),
      messageCount: 1
    })

    appendRawLog(db, {
      sessionId: 's1',
      role: 'user',
      content: '三天前',
      timestamp: new Date(2026, 6, 17, 10, 0, 0)
    })
    appendRawLog(db, {
      sessionId: 's1',
      role: 'user',
      content: '昨天',
      timestamp: new Date(2026, 6, 19, 10, 0, 0)
    })
    appendRawLog(db, {
      sessionId: 's1',
      role: 'user',
      content: '今天',
      timestamp: new Date(2026, 6, 20, 10, 0, 0)
    })

    vi.spyOn(llm, 'summarizePeriodWithLlm').mockResolvedValue({
      summary: '本周总结',
      keyFacts: ['周事实'],
      emotionTags: [],
      significance: 5,
      keywords: ['周']
    })

    const result = await maybeRunPeriodRollups(db, today)
    expect(result.weeklyDone).toBe(1)
    expect(result.profileUpdated).toBe(false)
    expect(db.select().from(sessionSummaries).all()).toHaveLength(0)
    expect(db.select().from(periodSummaries).where(eq(periodSummaries.kind, 'weekly')).all()).toHaveLength(
      1
    )

    const remaining = db.select().from(rawLogs).all()
    expect(remaining.map((r) => r.content).sort()).toEqual(['今天', '昨天'])

    const prunedAgain = pruneRawLogsKeepRecentCalendarDays(db, 2, today)
    expect(prunedAgain).toBe(0)
    expect(db.select().from(rawLogs).where(lt(rawLogs.timestamp, new Date(2026, 6, 19))).all()).toHaveLength(
      0
    )
  })

  it('weekly success does not call profile upsert', async () => {
    const db = await openDb()
    const { accumulateSessionSummary } = await import('../engine')
    const { maybeRunPeriodRollups } = await import('../periodRollup')
    const llm = await import('../periodSummarizeLlm')
    const profile = await import('../userProfile')

    const today = new Date(2026, 6, 20)
    accumulateSessionSummary(db, {
      id: 'ss-no-prof',
      summary: '会话',
      keyFacts: ['事实'],
      startedAt: new Date(2026, 6, 10),
      endedAt: new Date(2026, 6, 10),
      messageCount: 1
    })

    vi.spyOn(llm, 'summarizePeriodWithLlm').mockResolvedValue({
      summary: '本周总结',
      keyFacts: ['事实'],
      emotionTags: [],
      significance: 4,
      keywords: ['测']
    })
    const monthlyProfile = vi.spyOn(profile, 'upsertUserProfileFromMonthly')

    const result = await maybeRunPeriodRollups(db, today)
    expect(result.weeklyDone).toBe(1)
    expect(result.profileUpdated).toBe(false)
    expect(monthlyProfile).not.toHaveBeenCalled()
  })

  it('promotes weekly to core pool when significance ≥ 9.5', async () => {
    const db = await openDb()
    const { accumulateSessionSummary } = await import('../engine')
    const { listCoreMemories } = await import('../corePool')
    const { maybeRunPeriodRollups } = await import('../periodRollup')
    const llm = await import('../periodSummarizeLlm')

    const today = new Date(2026, 6, 20)
    accumulateSessionSummary(db, {
      id: 'ss-core',
      summary: '深爱会话',
      keyFacts: ['深爱'],
      startedAt: new Date(2026, 6, 10),
      endedAt: new Date(2026, 6, 10),
      messageCount: 1
    })

    vi.spyOn(llm, 'summarizePeriodWithLlm').mockResolvedValue({
      summary: '这一周用户表达了深深的爱意与承诺',
      keyFacts: ['深爱与承诺'],
      emotionTags: ['深爱'],
      significance: 9.8,
      keywords: ['深爱', '承诺']
    })

    await maybeRunPeriodRollups(db, today)
    const cores = listCoreMemories(db)
    expect(cores.some((c) => c.content.includes('深深的爱意') && c.category === '周总结')).toBe(true)
  })

  it('skips core promote when memoryEmotionScoreEnabled is false', async () => {
    const db = await openDb()
    const { accumulateSessionSummary } = await import('../engine')
    const { listCoreMemories } = await import('../corePool')
    const { maybeRunPeriodRollups } = await import('../periodRollup')
    const llm = await import('../periodSummarizeLlm')
    const flags = await import('../flags')

    vi.spyOn(flags, 'readMemoryFlags').mockReturnValue({
      memoryEnabled: true,
      memoryConsolidateOnChatClose: true,
      memoryLlmSummarizeEnabled: true,
      memoryEmotionScoreEnabled: false
    })

    const today = new Date(2026, 6, 20)
    accumulateSessionSummary(db, {
      id: 'ss-no-core',
      summary: '深爱会话',
      keyFacts: ['深爱'],
      startedAt: new Date(2026, 6, 10),
      endedAt: new Date(2026, 6, 10),
      messageCount: 1
    })

    vi.spyOn(llm, 'summarizePeriodWithLlm').mockResolvedValue({
      summary: '这一周用户表达了深深的爱意与承诺',
      keyFacts: ['深爱与承诺'],
      emotionTags: ['深爱'],
      significance: 9.9,
      keywords: ['深爱']
    })

    await maybeRunPeriodRollups(db, today)
    expect(listCoreMemories(db)).toHaveLength(0)
  })
})
