import { describe, expect, it } from 'vitest'

import {
  estimateTokenCount,
  formatPromptMemoryBlock,
  hasRecallIntent,
  MAX_SUMMARY_INJECT_TOKENS,
  scoreRelevanceAgainstTurn,
  type PromptMemoryContext
} from '../retriever'
import { describeMemoryDb } from './sqliteProbe'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach } from 'vitest'

describe('scoreRelevanceAgainstTurn', () => {
  it('matches key_facts and keywords against the turn', () => {
    const byFact = scoreRelevanceAgainstTurn('还记得我深爱着你吗', ['用户说深爱着雪澜', '加班到很晚'], [
      '草莓'
    ])
    expect(byFact.relevance).toBeGreaterThan(0)
    expect(byFact.matchedFacts.some((f) => f.includes('深爱'))).toBe(true)

    const byKeyword = scoreRelevanceAgainstTurn('我们谈谈感情吧', ['喜欢草莓新地'], ['感情'])
    expect(byKeyword.relevance).toBeGreaterThan(0)
  })

  it('keywords use sliding window like key_facts', () => {
    const strong = scoreRelevanceAgainstTurn('想吃草莓蛋糕', [], ['草莓'])
    expect(strong.relevance).toBe(1.5)

    const weak = scoreRelevanceAgainstTurn('说晚安了吗', [], ['睡前说晚安'])
    expect(weak.relevance).toBe(0.75)
  })

  it('ignores punctuation via normalize', () => {
    const r = scoreRelevanceAgainstTurn('我们谈谈「感情」吧！', [], ['感情'])
    expect(r.relevance).toBeGreaterThan(0)
  })

  it('weakly matches summary body when facts/keywords miss', () => {
    const onlySummary = scoreRelevanceAgainstTurn(
      '京都好玩吗',
      [],
      [],
      '那周一起规划了去京都旅行的细节和行程'
    )
    expect(onlySummary.relevance).toBeGreaterThan(0)
    expect(onlySummary.matchedFacts).toEqual([])
  })

  it('returns zero when unrelated', () => {
    const r = scoreRelevanceAgainstTurn('今天天气怎么样', ['喜欢草莓新地'], ['草莓'])
    expect(r.relevance).toBe(0)
    expect(r.matchedFacts).toEqual([])
  })
})

describe('hasRecallIntent', () => {
  it('detects recall trigger phrases', () => {
    expect(hasRecallIntent('你还记得吗')).toBe(true)
    expect(hasRecallIntent('上次我们说了什么')).toBe(true)
    expect(hasRecallIntent('今天吃什么')).toBe(false)
  })
})

describe('formatPromptMemoryBlock', () => {
  it('formats core, profile, and injected key_facts', () => {
    const ctx: PromptMemoryContext = {
      coreMemories: [{ id: '1', content: '我爱你', category: '深爱', weight: 9.9 }],
      userProfileBlock: '【用户画像｜务必记住】\n总体：温和',
      summaries: [
        {
          id: 's1',
          source: 'session',
          summary: '聊了草莓',
          significance: 4,
          keywords: ['草莓'],
          keyFacts: ['喜欢草莓新地'],
          matchedFacts: ['喜欢草莓新地'],
          injectedFacts: ['喜欢草莓新地'],
          relevance: 2,
          score: 1
        }
      ],
      summaryTokensUsed: 10
    }
    const block = formatPromptMemoryBlock(ctx)
    expect(block).toContain('核心记忆')
    expect(block).toContain('我爱你')
    expect(block).toContain('用户画像')
    expect(block).toContain('温和')
    expect(block).not.toContain('偷看了')
    expect(block).toContain('key_facts')
    expect(block).toContain('喜欢草莓新地')
  })

  it('returns empty when no memories', () => {
    expect(
      formatPromptMemoryBlock({
        coreMemories: [],
        userProfileBlock: '',
        summaries: [],
        summaryTokensUsed: 0
      })
    ).toBe('')
  })
})

describe('estimateTokenCount budget', () => {
  it('locks summary inject budget under 1024 tokens', () => {
    expect(MAX_SUMMARY_INJECT_TOKENS).toBe(1024)
    expect(estimateTokenCount('测'.repeat(1536))).toBeLessThanOrEqual(1024)
    expect(estimateTokenCount('测'.repeat(1537))).toBeGreaterThan(1024)
  })
})

describeMemoryDb('buildPromptMemoryContext', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('recalls key_facts by relevance then prefers higher significance', async () => {
    const { openMemoryDbAt } = await import('../dbCore')
    const { accumulateSessionSummary, updateSessionSummaryScore } = await import('../engine')
    const { tryPromoteToCorePool } = await import('../corePool')
    const { buildPromptMemoryContext } = await import('../retriever')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-ret-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()

    const t0 = new Date('2026-01-01T00:00:00Z')
    accumulateSessionSummary(opened.db, {
      id: 's-love',
      summary: '用户说深爱着雪澜',
      keyFacts: ['深爱着雪澜', '要一起看星星'],
      startedAt: t0,
      endedAt: t0,
      messageCount: 2
    })
    updateSessionSummaryScore(opened.db, {
      id: 's-love',
      significance: 9.8,
      keywords: ['深爱', '感情']
    })
    accumulateSessionSummary(opened.db, {
      id: 's-food',
      summary: '聊了草莓新地',
      keyFacts: ['喜欢草莓新地'],
      startedAt: new Date('2026-01-02T00:00:00Z'),
      endedAt: new Date('2026-01-02T00:00:00Z'),
      messageCount: 2
    })
    updateSessionSummaryScore(opened.db, {
      id: 's-food',
      significance: 3,
      keywords: ['草莓']
    })
    tryPromoteToCorePool(opened.db, {
      content: '我深爱用户',
      significance: 9.9,
      keywords: ['深爱']
    })

    const ctx = buildPromptMemoryContext(opened.db, { userInput: '我们谈谈感情吧' })
    expect(ctx.coreMemories.length).toBe(1)
    expect(ctx.summaries[0]?.id).toBe('s-love')
    expect(ctx.summaries[0]?.injectedFacts.some((f) => f.includes('深爱') || f.includes('雪澜'))).toBe(
      true
    )
    expect(ctx.summaryTokensUsed).toBeLessThan(MAX_SUMMARY_INJECT_TOKENS)
  })

  it('recalls period_summaries key_facts alongside session', async () => {
    const { openMemoryDbAt } = await import('../dbCore')
    const { periodSummaries } = await import('../schema')
    const { buildPromptMemoryContext } = await import('../retriever')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-ret-period-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()

    opened.db
      .insert(periodSummaries)
      .values({
        id: 'pw1',
        kind: 'weekly',
        periodStart: new Date('2026-01-01T00:00:00Z'),
        periodEnd: new Date('2026-01-07T00:00:00Z'),
        summary: '那周聊了旅行',
        keyFacts: ['计划去京都旅行'],
        keywords: ['旅行', '京都'],
        significance: 8,
        emotionTags: [],
        sourceIds: [],
        createdAt: new Date()
      })
      .run()

    const ctx = buildPromptMemoryContext(opened.db, { userInput: '京都好玩吗' })
    expect(ctx.summaries.some((s) => s.id === 'pw1' && s.source === 'period')).toBe(true)
    expect(ctx.summaries[0]?.injectedFacts.some((f) => f.includes('京都'))).toBe(true)
  })

  it('ranks by score (relevance×significance×decay) not relevance alone', async () => {
    const { openMemoryDbAt } = await import('../dbCore')
    const { accumulateSessionSummary, updateSessionSummaryScore } = await import('../engine')
    const { buildPromptMemoryContext } = await import('../retriever')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-ret-score-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()

    const t = new Date('2026-06-01T00:00:00Z')
    // 弱 keyword 命中 + 高 significance → score 更高
    accumulateSessionSummary(opened.db, {
      id: 's-hi-score',
      summary: '闲聊作息',
      keyFacts: ['习惯很晚睡'],
      startedAt: t,
      endedAt: t,
      messageCount: 2
    })
    updateSessionSummaryScore(opened.db, {
      id: 's-hi-score',
      significance: 10,
      keywords: ['睡前说晚安']
    })
    // 强 keyword 命中 + 低 significance → relevance 更高但 score 更低
    accumulateSessionSummary(opened.db, {
      id: 's-hi-rel',
      summary: '随口道晚安',
      keyFacts: ['互相说了晚安'],
      startedAt: t,
      endedAt: t,
      messageCount: 2
    })
    updateSessionSummaryScore(opened.db, {
      id: 's-hi-rel',
      significance: 2,
      keywords: ['晚安']
    })

    const ctx = buildPromptMemoryContext(opened.db, {
      userInput: '说晚安了吗',
      nowMs: t.getTime()
    })
    expect(ctx.summaries[0]?.id).toBe('s-hi-score')
  })

  it('recall-trigger fallback injects top significance when zero hits', async () => {
    const { openMemoryDbAt } = await import('../dbCore')
    const { accumulateSessionSummary, updateSessionSummaryScore } = await import('../engine')
    const { buildPromptMemoryContext } = await import('../retriever')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-ret-fallback-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()

    const t = new Date('2026-06-01T00:00:00Z')
    accumulateSessionSummary(opened.db, {
      id: 's-old',
      summary: '聊了加班',
      keyFacts: ['经常加班到很晚'],
      startedAt: t,
      endedAt: t,
      messageCount: 2
    })
    updateSessionSummaryScore(opened.db, {
      id: 's-old',
      significance: 8,
      keywords: ['加班']
    })

    const miss = buildPromptMemoryContext(opened.db, {
      userInput: '今天吃什么',
      nowMs: t.getTime()
    })
    expect(miss.summaries).toHaveLength(0)

    const hit = buildPromptMemoryContext(opened.db, {
      userInput: '你还记得吗',
      nowMs: t.getTime()
    })
    expect(hit.summaries.some((s) => s.id === 's-old')).toBe(true)
    expect(hit.summaries[0]?.injectedFacts.some((f) => f.includes('加班'))).toBe(true)
  })
})
