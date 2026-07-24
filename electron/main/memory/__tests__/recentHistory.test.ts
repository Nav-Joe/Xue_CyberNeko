import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { describeMemoryDb } from './sqliteProbe'

describeMemoryDb('getRecentHistoryForPrompt', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('takes newest rounds by timestamp across sessions', async () => {
    const { openMemoryDbAt } = await import('../dbCore')
    const { appendRawLog, getRecentHistoryForPrompt, listRecentRawLogs } = await import('../engine')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-memory-hist-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()

    const t0 = new Date('2026-01-01T00:00:00Z')
    for (let i = 0; i < 5; i += 1) {
      const ts = new Date(t0.getTime() + i * 60_000)
      appendRawLog(opened.db, {
        sessionId: i < 2 ? 'old' : 'new',
        role: 'user',
        content: `u${i}`,
        timestamp: ts
      })
      appendRawLog(opened.db, {
        sessionId: i < 2 ? 'old' : 'new',
        role: 'assistant',
        content: `a${i}`,
        timestamp: new Date(ts.getTime() + 1000)
      })
    }

    const asc = listRecentRawLogs(opened.db, 4)
    expect(asc.map((r) => r.content)).toEqual(['u3', 'a3', 'u4', 'a4'])

    const history = getRecentHistoryForPrompt(opened.db, 2)
    expect(history).toHaveLength(4)
    expect(history[0]).toEqual({ role: 'user', content: 'u3' })
    expect(history.at(-1)).toEqual({ role: 'assistant', content: 'a4' })
    expect(history.some((m) => m.content === 'u0')).toBe(false)
  })
})
