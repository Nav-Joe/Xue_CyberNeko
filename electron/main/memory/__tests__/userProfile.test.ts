import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { describeMemoryDb } from './sqliteProbe'
import {
  clampFrequentBehaviors,
  FREQUENT_BEHAVIORS_MAX,
  formatUserProfileBlock,
  USER_PROFILE_ID
} from '../userProfile'

describe('clampFrequentBehaviors', () => {
  it(`keeps at most ${FREQUENT_BEHAVIORS_MAX} items`, () => {
    const many = Array.from({ length: 15 }, (_, i) => `行为${i}`)
    expect(clampFrequentBehaviors(many)).toHaveLength(FREQUENT_BEHAVIORS_MAX)
  })
})

describe('formatUserProfileBlock', () => {
  it('returns empty for null or blank profile', () => {
    expect(formatUserProfileBlock(null)).toBe('')
    expect(
      formatUserProfileBlock({
        id: USER_PROFILE_ID,
        interests: '',
        summary: '',
        personality: '',
        age: '未知',
        addressName: '未知',
        attitudeToNeko: '',
        frequentBehaviors: [],
        sourceWeeklyId: null,
        updatedAt: new Date()
      })
    ).toBe('')
  })

  it('formats non-empty profile for system inject', () => {
    const block = formatUserProfileBlock({
      id: USER_PROFILE_ID,
      interests: '钓鱼',
      summary: '温和的人',
      personality: '内向',
      age: '未知',
      addressName: '小雪',
      attitudeToNeko: '很喜欢',
      frequentBehaviors: ['晚聊'],
      sourceWeeklyId: 'm1',
      updatedAt: new Date()
    })
    expect(block).toContain('【用户画像')
    expect(block).toContain('温和的人')
    expect(block).toContain('钓鱼')
    expect(block).toContain('小雪')
    expect(block).toContain('晚聊')
  })
})

describeMemoryDb('user profile in prompt context', () => {
  let dir: string
  let close: (() => void) | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    close?.()
    close = null
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('injects non-empty profile into prompt block outside summary recall', async () => {
    const { openMemoryDbAt } = await import('../dbCore')
    const { userProfile } = await import('../schema')
    const { buildPromptMemoryContext, formatPromptMemoryBlock, estimateTokenCount } = await import(
      '../retriever'
    )
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-prof-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()

    opened.db
      .insert(userProfile)
      .values({
        id: USER_PROFILE_ID,
        interests: '草莓',
        summary: '爱吃甜食的人',
        personality: '开朗',
        age: '未知',
        addressName: '主人',
        attitudeToNeko: '亲近',
        frequentBehaviors: ['点甜品'],
        sourceWeeklyId: 'm1',
        updatedAt: new Date()
      })
      .run()

    const ctx = buildPromptMemoryContext(opened.db, { userInput: '随便聊聊' })
    expect(ctx.userProfileBlock).toContain('爱吃甜食的人')
    expect(ctx.summaries).toHaveLength(0)
    const block = formatPromptMemoryBlock(ctx)
    expect(block).toContain('用户画像')
    expect(block).toContain('爱吃甜食的人')
    expect(block).not.toContain('key_facts 召回')
    const profileCost = estimateTokenCount(ctx.userProfileBlock)
    expect(profileCost).toBeGreaterThan(5)
    expect(ctx.summaryTokensUsed).toBeLessThan(profileCost)
  })

  it('monthly upserts full profile including frequent_behaviors ≤10', async () => {
    const { openMemoryDbAt } = await import('../dbCore')
    const { periodSummaries } = await import('../schema')
    const { upsertUserProfileFromMonthly, getUserProfile, FREQUENT_BEHAVIORS_MAX } =
      await import('../userProfile')
    const { buildPromptMemoryContext, formatPromptMemoryBlock } = await import('../retriever')
    const summarizeLlm = await import('../summarizeLlm')
    const migrationsFolder = join(__dirname, '..', 'migrations')
    dir = mkdtempSync(join(tmpdir(), 'xue-prof-mo-'))
    const opened = openMemoryDbAt(join(dir, 'memory.db'), migrationsFolder)
    close = () => opened.sqlite.close()

    opened.db
      .insert(periodSummaries)
      .values({
        id: 'monthly-1',
        kind: 'monthly',
        periodStart: new Date(2026, 5, 1),
        periodEnd: new Date(2026, 5, 30),
        summary: '这个月聊了钓鱼、晚聊和甜品',
        keyFacts: ['钓鱼', '晚聊'],
        keywords: ['习惯'],
        significance: 7,
        emotionTags: [],
        sourceIds: [],
        createdAt: new Date()
      })
      .run()

    const many = Array.from({ length: 15 }, (_, i) => `习惯${i}`)
    vi.spyOn(summarizeLlm, 'completeMemoryChat').mockResolvedValue(
      JSON.stringify({
        interests: '钓鱼',
        summary: '喜欢户外的人',
        personality: '沉稳',
        age: '未知',
        address_name: '阿雪',
        attitude_to_neko: '亲密',
        frequent_behaviors: many
      })
    )

    const ok = await upsertUserProfileFromMonthly(opened.db, 'monthly-1')
    expect(ok).toBe(true)
    const row = getUserProfile(opened.db)
    expect(row?.interests).toBe('钓鱼')
    expect(row?.addressName).toBe('阿雪')
    expect(row?.sourceWeeklyId).toBe('monthly-1')
    expect(row?.frequentBehaviors).toHaveLength(FREQUENT_BEHAVIORS_MAX)
    expect(row?.frequentBehaviors[0]).toBe('习惯0')

    const block = formatPromptMemoryBlock(
      buildPromptMemoryContext(opened.db, { userInput: '今天怎样' })
    )
    expect(block).toContain('【用户画像')
    expect(block).toContain('喜欢户外的人')
    expect(block).toContain('阿雪')
    expect(block).toContain('习惯0')
  })
})
