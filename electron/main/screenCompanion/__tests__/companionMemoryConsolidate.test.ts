import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { describeMemoryDb } from '../../memory/__tests__/sqliteProbe'

vi.mock('../../memory/flags', () => ({
  readMemoryFlags: vi.fn(() => ({
    memoryEnabled: true,
    memoryConsolidateOnChatClose: true,
    memoryLlmSummarizeEnabled: true,
    memoryEmotionScoreEnabled: true
  }))
}))

vi.mock('../../memory/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../memory/runtime')>()
  return {
    ...actual,
    isMemoryReady: vi.fn(() => true),
    requireMemoryDb: vi.fn()
  }
})

vi.mock('../../memory/summarizeCompanionLlm', () => ({
  summarizeCompanionLogsWithLlm: vi.fn(async () => ({
    summary: '陪玩摘要',
    keyFacts: ['玩了 DemoGame'],
    emotionTags: [],
    significance: 6,
    keywords: ['DemoGame'],
    memoryKind: 'habit',
    engine: 'llm' as const
  }))
}))

describeMemoryDb('consolidateCompanionSessionOnLeave', () => {
  let dir: string
  let close: (() => void) | null = null
  let db: import('../../memory/dbCore').MemoryDatabase

  beforeEach(async () => {
    const { openMemoryDbAt } = await import('../../memory/dbCore')
    const migrationsFolder = join(__dirname, '../../memory/migrations')
    dir = mkdtempSync(join(tmpdir(), 'sc-memory-consolidate-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    db = opened.db
    close = () => opened.sqlite.close()
    const runtime = await import('../../memory/runtime')
    vi.mocked(runtime.requireMemoryDb).mockReturnValue(db)
    const { setCompanionMemoryLogTestHooks, appendCompanionMemoryLog } = await import(
      '../companionMemoryLog'
    )
    setCompanionMemoryLogTestHooks({ logDir: join(dir, 'logs') })
    appendCompanionMemoryLog('companion-abc', {
      kind: 'narrate',
      gameName: 'DemoGame',
      text: '好耶'
    })
  })

  afterEach(async () => {
    const { setCompanionMemoryLogTestHooks } = await import('../companionMemoryLog')
    setCompanionMemoryLogTestHooks({ logDir: null })
    close?.()
    close = null
    rmSync(dir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('writes companion row to session_summaries and removes jsonl', async () => {
    const { consolidateCompanionSessionOnLeave } = await import('../companionMemoryConsolidate')
    const { readCompanionMemoryLog } = await import('../companionMemoryLog')
    const { sessionSummaries } = await import('../../memory/schema')
    const { eq } = await import('drizzle-orm')

    const result = await consolidateCompanionSessionOnLeave({
      companionSessionId: 'companion-abc',
      gameName: 'DemoGame',
      startedAtMs: Date.UTC(2026, 7, 23, 10, 0),
      endedAtMs: Date.UTC(2026, 7, 23, 11, 0)
    })

    expect(result.ok).toBe(true)
    const row = db.select().from(sessionSummaries).where(eq(sessionSummaries.id, 'companion-abc')).get()
    expect(row?.source).toBe('companion')
    expect(row?.sourceLabel).toBe('DemoGame')
    expect(row?.summary).toContain('陪玩摘要')
    expect(readCompanionMemoryLog('companion-abc')).toHaveLength(0)
  })
})
