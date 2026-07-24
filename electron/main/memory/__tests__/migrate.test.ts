import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { describeMemoryDb } from './sqliteProbe'

/** 桌宠主进程用 Electron ABI；普通 vitest 在 Node 上可能 skip。完整库测: npm run test:memory */
describeMemoryDb('memory migrate()', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    close?.()
    close = null
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('applies drizzle migrations and creates base tables', async () => {
    const { openMemoryDbAt } = await import('../dbCore')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-memory-'))
    const { sqlite } = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => sqlite.close()

    const names = (
      sqlite.prepare(`select name from sqlite_master where type = 'table' order by name`).all() as {
        name: string
      }[]
    ).map((r) => r.name)

    expect(names).toContain('core_memories')
    expect(names).toContain('memory_events')
    expect(names).toContain('memory_meta')
    expect(names).toContain('raw_logs')
    expect(names).toContain('session_summaries')
    expect(names).toContain('period_summaries')
    expect(names).toContain('user_profile')
    expect(names).toContain('__drizzle_migrations')

    const coreCols = (
      sqlite.prepare(`pragma table_info(core_memories)`).all() as { name: string }[]
    ).map((r) => r.name)
    expect(coreCols).toEqual(
      expect.arrayContaining(['significance', 'memory_kind', 'hit_count', 'keywords', 'weight'])
    )
    const sessionCols = (
      sqlite.prepare(`pragma table_info(session_summaries)`).all() as { name: string }[]
    ).map((r) => r.name)
    expect(sessionCols).toContain('memory_kind')
  })
})
