import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { describeMemoryDb } from './sqliteProbe'

describeMemoryDb('consolidateOnChatClose gate', () => {
  let dir = ''
  let close: (() => void) | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  async function openDb() {
    const { openMemoryDbAt } = await import('../dbCore')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'mem-consol-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()
    return opened.db
  }

  it('skips LLM when preferred session has no raw (does not fall back to other sessions)', async () => {
    const db = await openDb()
    const { appendRawLog } = await import('../engine')
    const { consolidateOnChatClose } = await import('../consolidate')
    const summarize = await import('../summarizeLlm')
    const spy = vi.spyOn(summarize, 'summarizeLogsWithLlm').mockResolvedValue({
      summary: 'should-not-run',
      keyFacts: [],
      emotionTags: [],
      significance: 1,
      keywords: [],
      memoryKind: 'fact',
      engine: 'llm'
    })

    appendRawLog(db, {
      sessionId: 'old-session',
      role: 'user',
      content: '上次聊过',
      timestamp: new Date()
    })
    appendRawLog(db, {
      sessionId: 'old-session',
      role: 'assistant',
      content: '嗯',
      timestamp: new Date()
    })

    const result = await consolidateOnChatClose(db, 'brand-new-empty-session')
    expect(result).toMatchObject({ ok: false, reason: 'empty' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('skips LLM when preferred session id is missing', async () => {
    const db = await openDb()
    const { appendRawLog } = await import('../engine')
    const { consolidateOnChatClose } = await import('../consolidate')
    const summarize = await import('../summarizeLlm')
    const spy = vi.spyOn(summarize, 'summarizeLogsWithLlm').mockResolvedValue({
      summary: 'should-not-run',
      keyFacts: [],
      emotionTags: [],
      significance: 1,
      keywords: [],
      memoryKind: 'fact',
      engine: 'llm'
    })

    appendRawLog(db, {
      sessionId: 'old-session',
      role: 'user',
      content: '有旧日志',
      timestamp: new Date()
    })

    const result = await consolidateOnChatClose(db, undefined)
    expect(result).toMatchObject({ ok: false, reason: 'empty' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('calls LLM when preferred session has raw logs', async () => {
    const db = await openDb()
    const { appendRawLog } = await import('../engine')
    const { consolidateOnChatClose } = await import('../consolidate')
    const summarize = await import('../summarizeLlm')
    vi.spyOn(summarize, 'summarizeLogsWithLlm').mockResolvedValue({
      summary: '本轮摘要',
      keyFacts: ['k'],
      emotionTags: [],
      significance: 5,
      keywords: ['k'],
      memoryKind: 'habit',
      engine: 'llm'
    })

    appendRawLog(db, {
      sessionId: 's-chat',
      role: 'user',
      content: '你好',
      timestamp: new Date(1)
    })
    appendRawLog(db, {
      sessionId: 's-chat',
      role: 'assistant',
      content: '喵',
      timestamp: new Date(2)
    })

    const result = await consolidateOnChatClose(db, 's-chat')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.sessionId).toBe('s-chat')
    }
  })
})
