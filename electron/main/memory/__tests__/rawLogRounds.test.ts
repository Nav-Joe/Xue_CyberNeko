import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { describeMemoryDb } from './sqliteProbe'
import {
  countGlobalRawLogRounds,
  pruneRawLogsToKeepRecentRounds,
  splitRawLogsIntoRounds
} from '../rawLogRounds'

describe('splitRawLogsIntoRounds', () => {
  it('groups user + following assistants as one round', () => {
    const rounds = splitRawLogsIntoRounds([
      {
        id: '1',
        sessionId: 's',
        role: 'user',
        content: 'u1',
        timestamp: new Date(1)
      },
      {
        id: '2',
        sessionId: 's',
        role: 'assistant',
        content: 'a1',
        timestamp: new Date(2)
      },
      {
        id: '3',
        sessionId: 's',
        role: 'user',
        content: 'u2',
        timestamp: new Date(3)
      }
    ])
    expect(rounds).toHaveLength(2)
    expect(rounds[0]!.map((r) => r.id)).toEqual(['1', '2'])
    expect(rounds[1]!.map((r) => r.id)).toEqual(['3'])
  })
})

describeMemoryDb('rawLogRounds prune + mid consolidate', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function openDb() {
    const { openMemoryDbAt } = await import('../dbCore')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-memory-rounds-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()
    return opened.db
  }

  it('prunes oldest rounds and keeps recent N', async () => {
    const { appendRawLog } = await import('../engine')
    const db = await openDb()
    const base = Date.now()
    for (let i = 0; i < 5; i++) {
      appendRawLog(db, {
        sessionId: 's1',
        role: 'user',
        content: `u${i}`,
        timestamp: new Date(base + i * 2)
      })
      appendRawLog(db, {
        sessionId: 's1',
        role: 'assistant',
        content: `a${i}`,
        timestamp: new Date(base + i * 2 + 1)
      })
    }
    expect(countGlobalRawLogRounds(db)).toBe(5)
    const pruned = pruneRawLogsToKeepRecentRounds(db, 3)
    expect(pruned.prunedRounds).toBe(2)
    expect(pruned.remainingRounds).toBe(3)
    expect(countGlobalRawLogRounds(db)).toBe(3)
  })

  it('maybeConsolidateOnRoundCap summarizes excess then keeps soft window', async () => {
    const { appendRawLog, getSessionSummary } = await import('../engine')
    const consolidate = await import('../consolidate')
    const llm = await import('../summarizeLlm')
    const db = await openDb()
    const base = Date.now()
    for (let i = 0; i < 20; i++) {
      appendRawLog(db, {
        sessionId: 'chat-1',
        role: 'user',
        content: `turn-${i}`,
        timestamp: new Date(base + i * 2)
      })
      appendRawLog(db, {
        sessionId: 'chat-1',
        role: 'assistant',
        content: `reply-${i}`,
        timestamp: new Date(base + i * 2 + 1)
      })
    }
    expect(countGlobalRawLogRounds(db)).toBe(20)

    vi.spyOn(llm, 'summarizeLogsWithLlm').mockResolvedValue({
      summary: '旧轮摘要',
      keyFacts: ['fact'],
      emotionTags: [],
      significance: 4,
      keywords: ['闲聊']
    })

    const result = await consolidate.maybeConsolidateOnRoundCap(db, {
      summarySessionId: 'chat-1',
      llmMode: 'local_llama'
    })
    expect(result).toMatchObject({
      ok: true,
      triggered: true,
      prunedRounds: 10,
      remainingRounds: 10
    })
    expect(countGlobalRawLogRounds(db)).toBe(10)
    expect(getSessionSummary(db, 'chat-1')?.summary).toContain('旧轮摘要')
    expect(llm.summarizeLogsWithLlm).toHaveBeenCalled()
  })

  it('does not prune when below soft max', async () => {
    const { appendRawLog } = await import('../engine')
    const { maybeConsolidateOnRoundCap } = await import('../consolidate')
    const db = await openDb()
    appendRawLog(db, {
      sessionId: 's',
      role: 'user',
      content: 'hi',
      timestamp: new Date()
    })
    const result = await maybeConsolidateOnRoundCap(db, {
      summarySessionId: 's',
      llmMode: 'openai_api'
    })
    expect(result).toEqual({
      ok: true,
      triggered: false,
      reason: 'below_threshold',
      rounds: 1,
      softMax: 50
    })
  })

  it('llm failure does not prune', async () => {
    const { appendRawLog } = await import('../engine')
    const consolidate = await import('../consolidate')
    const llm = await import('../summarizeLlm')
    const db = await openDb()
    const base = Date.now()
    for (let i = 0; i < 20; i++) {
      appendRawLog(db, {
        sessionId: 's',
        role: 'user',
        content: `u${i}`,
        timestamp: new Date(base + i * 2)
      })
      appendRawLog(db, {
        sessionId: 's',
        role: 'assistant',
        content: `a${i}`,
        timestamp: new Date(base + i * 2 + 1)
      })
    }
    vi.spyOn(llm, 'summarizeLogsWithLlm').mockRejectedValue(new Error('down'))
    const result = await consolidate.maybeConsolidateOnRoundCap(db, {
      summarySessionId: 's',
      llmMode: 'local_llama'
    })
    expect(result.ok).toBe(false)
    expect(countGlobalRawLogRounds(db)).toBe(20)
  })
})
