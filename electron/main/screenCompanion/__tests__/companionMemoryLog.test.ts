import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../memory/flags', () => ({
  readMemoryFlags: vi.fn(() => ({ memoryEnabled: true }))
}))

import {
  appendCompanionMemoryLog,
  readCompanionMemoryLog,
  removeCompanionMemoryLog,
  setCompanionMemoryLogTestHooks
} from '../companionMemoryLog'
import { readMemoryFlags } from '../../memory/flags'

describe('companionMemoryLog', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sc-memory-log-'))
    setCompanionMemoryLogTestHooks({ logDir: dir })
    vi.mocked(readMemoryFlags).mockReturnValue({
      memoryEnabled: true,
      memoryConsolidateOnChatClose: true,
      memoryLlmSummarizeEnabled: true,
      memoryEmotionScoreEnabled: true
    })
  })

  afterEach(() => {
    setCompanionMemoryLogTestHooks({ logDir: null })
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('appends narrate and observe lines as JSONL', () => {
    const id = 'companion-test-1'
    appendCompanionMemoryLog(id, {
      kind: 'observe',
      gameName: 'DemoGame',
      text: '用户在主菜单'
    })
    appendCompanionMemoryLog(id, {
      kind: 'narrate',
      gameName: 'DemoGame',
      text: '这菜单挺有味道'
    })
    const rows = readCompanionMemoryLog(id)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.kind).toBe('observe')
    expect(rows[1]?.kind).toBe('narrate')
  })

  it('skips append when memory disabled', () => {
    vi.mocked(readMemoryFlags).mockReturnValue({
      memoryEnabled: false,
      memoryConsolidateOnChatClose: true,
      memoryLlmSummarizeEnabled: true,
      memoryEmotionScoreEnabled: true
    })
    const id = 'companion-test-off'
    appendCompanionMemoryLog(id, { kind: 'narrate', gameName: 'G', text: 'hi' })
    expect(readCompanionMemoryLog(id)).toHaveLength(0)
  })

  it('remove clears log file', () => {
    const id = 'companion-test-rm'
    appendCompanionMemoryLog(id, { kind: 'narrate', gameName: 'G', text: 'bye' })
    removeCompanionMemoryLog(id)
    expect(readCompanionMemoryLog(id)).toHaveLength(0)
  })
})
