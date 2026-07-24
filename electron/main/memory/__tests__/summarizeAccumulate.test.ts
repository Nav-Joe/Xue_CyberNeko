import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { describeMemoryDb } from './sqliteProbe'
import { parseLlmSummaryContent, buildTranscript, KEYWORDS_RECALL_HINT } from '../summarizeLlm'

describe('KEYWORDS_RECALL_HINT', () => {
  it('steers keywords toward short searchable proper nouns', () => {
    expect(KEYWORDS_RECALL_HINT).toMatch(/2～6 字/)
    expect(KEYWORDS_RECALL_HINT).toMatch(/专名/)
    expect(KEYWORDS_RECALL_HINT).toMatch(/空泛/)
  })
})

describe('buildTranscript', () => {
  it('includes local timestamps when present', () => {
    const text = buildTranscript([
      {
        role: 'user',
        content: '你好',
        timestamp: new Date('2026-07-22T13:01:00+08:00')
      },
      {
        role: 'assistant',
        content: '喵',
        timestamp: new Date('2026-07-22T13:01:30+08:00')
      }
    ])
    expect(text).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] 用户: 你好/)
    expect(text).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] 助手: 喵/)
  })

  it('omits bracket when timestamp missing', () => {
    expect(buildTranscript([{ role: 'user', content: '嗨' }])).toBe('用户: 嗨')
  })
})

describe('parseLlmSummaryContent', () => {
  it('parses plain json', () => {
    const parsed = parseLlmSummaryContent(
      JSON.stringify({
        summary: '聊了草莓和新地',
        key_facts: ['喜欢草莓', '叫 Joe'],
        emotion_tags: ['开心'],
        significance: 7.5,
        keywords: ['草莓', '名字']
      })
    )
    expect(parsed.summary).toContain('草莓')
    expect(parsed.keyFacts).toEqual(['喜欢草莓', '叫 Joe'])
    expect(parsed.emotionTags).toEqual(['开心'])
    expect(parsed.significance).toBe(7.5)
    expect(parsed.keywords).toEqual(['草莓', '名字'])
    expect(parsed.memoryKind).toBe('habit')
  })

  it('extracts json from surrounding text', () => {
    const parsed = parseLlmSummaryContent(
      '好的\n{"summary":"概要","key_facts":["a"],"emotion_tags":[],"significance":3,"keywords":["闲聊"],"memory_kind":"fact"}\n'
    )
    expect(parsed.summary).toBe('概要')
    expect(parsed.keyFacts).toEqual(['a'])
    expect(parsed.significance).toBe(3)
    expect(parsed.keywords).toEqual(['闲聊'])
    expect(parsed.memoryKind).toBe('fact')
  })

  it('defaults missing significance/keywords', () => {
    const parsed = parseLlmSummaryContent(
      JSON.stringify({ summary: '只有摘要', key_facts: [], emotion_tags: [] })
    )
    expect(parsed.significance).toBe(0)
    expect(parsed.keywords).toEqual([])
    expect(parsed.memoryKind).toBe('habit')
  })
})

describeMemoryDb('accumulateSessionSummary', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('merges instead of replacing existing summary', async () => {
    const { openMemoryDbAt } = await import('../dbCore')
    const { accumulateSessionSummary, getSessionSummary } = await import('../engine')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-memory-acc-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()

    const t0 = new Date('2026-01-01T00:00:00Z')
    accumulateSessionSummary(opened.db, {
      id: 's1',
      summary: '第一段摘要',
      keyFacts: ['事实A'],
      emotionTags: ['平静'],
      startedAt: t0,
      endedAt: t0,
      messageCount: 2
    })
    accumulateSessionSummary(opened.db, {
      id: 's1',
      summary: '第二段摘要',
      keyFacts: ['事实A', '事实B'],
      emotionTags: ['开心'],
      startedAt: t0,
      endedAt: new Date('2026-01-01T01:00:00Z'),
      messageCount: 4
    })

    const row = getSessionSummary(opened.db, 's1')
    expect(row?.summary).toContain('第一段摘要')
    expect(row?.summary).toContain('第二段摘要')
    expect(row?.summary).toContain('---')
    expect(row?.keyFacts).toEqual(['事实A', '事实B'])
    expect(row?.emotionTags?.sort()).toEqual(['平静', '开心'].sort())
    expect(row?.messageCount).toBe(4)
  })
})
