import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { eq } from 'drizzle-orm'

import { describeMemoryDb } from './sqliteProbe'
import {
  formatPeekAccessStamp,
  formatPeekUserInjectLine,
  formatPeekUserInjectPrefix,
  stripPeekUserInjectPrefix
} from '../peek'

describe('formatPeekUserInject', () => {
  it('formats one line with local stamp', () => {
    const t = new Date(2026, 6, 23, 14, 32, 0).getTime()
    expect(formatPeekAccessStamp(t)).toBe('2026-07-23 14:32')
    expect(formatPeekUserInjectLine(t)).toBe(
      '【用户（2026-07-23 14:32）偷看了你的记忆和小心思】'
    )
  })

  it('joins multiple lines for LLM user prefix', () => {
    const t1 = new Date(2026, 6, 23, 14, 32, 0).getTime()
    const t2 = new Date(2026, 6, 23, 14, 35, 0).getTime()
    expect(formatPeekUserInjectPrefix([t1, t2])).toBe(
      [
        '【用户（2026-07-23 14:32）偷看了你的记忆和小心思】',
        '【用户（2026-07-23 14:35）偷看了你的记忆和小心思】'
      ].join('\n')
    )
  })

  it('strips peek inject lines from raw_log content', () => {
    const prefix = formatPeekUserInjectPrefix([
      new Date(2026, 6, 23, 14, 32, 0).getTime(),
      new Date(2026, 6, 23, 14, 35, 0).getTime()
    ])
    expect(stripPeekUserInjectPrefix(`${prefix}\n你有没有发现什么？`)).toBe('你有没有发现什么？')
    expect(stripPeekUserInjectPrefix('普通消息')).toBe('普通消息')
    expect(stripPeekUserInjectPrefix(prefix)).toBe('')
  })
})

describeMemoryDb('memory engine + peek', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function openDb() {
    const { openMemoryDbAt } = await import('../dbCore')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-memory-eng-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()
    return opened.db
  }

  it('prunes raw_logs beyond session limit', async () => {
    const {
      appendRawLog,
      listDistinctRawSessionIds,
      MAX_RAW_SESSIONS,
      pruneRawLogsBeyondSessionLimit
    } = await import('../engine')
    const db = await openDb()
    const base = Date.now()
    for (let i = 0; i < MAX_RAW_SESSIONS + 2; i++) {
      appendRawLog(db, {
        sessionId: `s${i}`,
        role: 'user',
        content: `hello-${i}`,
        timestamp: new Date(base + i * 1000)
      })
    }
    expect(listDistinctRawSessionIds(db)).toHaveLength(MAX_RAW_SESSIONS + 2)
    const dropped = pruneRawLogsBeyondSessionLimit(db)
    expect(dropped).toEqual(['s0', 's1'])
    expect(listDistinctRawSessionIds(db).sort()).toEqual(['s2', 's3', 's4'])
  })

  it('marks peek on open and consumes into user-turn prefix once', async () => {
    const {
      recordMemoryPeek,
      consumePendingPeeksForUserTurn,
      formatPeekAccessStamp,
      PEEK_EVENT_TYPE
    } = await import('../peek')
    const { listTimeline } = await import('../engine')
    const { memoryEvents } = await import('../schema')
    const db = await openDb()
    const t0 = new Date(2026, 6, 23, 14, 32, 0).getTime()
    const t1 = new Date(2026, 6, 23, 14, 35, 0).getTime()

    recordMemoryPeek(db, t0)
    recordMemoryPeek(db, t1)

    // L3 仅周/月总结；peek 事件不进时间线
    expect(listTimeline(db, { layer: 'L3' }).every((item) => item.kind === 'period')).toBe(true)

    const consumed = consumePendingPeeksForUserTurn(db)
    expect(consumed.count).toBe(2)
    expect(consumed.prefix).toContain(`【用户（${formatPeekAccessStamp(t0)}）偷看了你的记忆和小心思】`)
    expect(consumed.prefix).toContain(`【用户（${formatPeekAccessStamp(t1)}）偷看了你的记忆和小心思】`)

    // 消费后事件清空；再消费为空
    expect(
      db.select().from(memoryEvents).where(eq(memoryEvents.eventType, PEEK_EVENT_TYPE)).all()
    ).toHaveLength(0)
    expect(consumePendingPeeksForUserTurn(db)).toEqual({ prefix: '', count: 0, stamps: [] })
  })

  it('appendRawLog strips peek inject from user content', async () => {
    const { appendRawLog, listRawLogsForSession } = await import('../engine')
    const { formatPeekUserInjectPrefix } = await import('../peek')
    const db = await openDb()
    const prefix = formatPeekUserInjectPrefix([new Date(2026, 6, 23, 14, 32, 0).getTime()])
    appendRawLog(db, {
      sessionId: 's-peek',
      role: 'user',
      content: `${prefix}\n你好`
    })
    const rows = listRawLogsForSession(db, 's-peek')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.content).toBe('你好')
  })
})
