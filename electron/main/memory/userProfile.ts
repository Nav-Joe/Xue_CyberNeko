import { eq } from 'drizzle-orm'

import type { ChatHistoryMessage } from '../../../src/services/chat/types'
import type { MemoryDatabase } from './dbCore'
import { logInfo, logWarn } from '../logging/logger'
import { completeMemoryChat, extractJsonObject } from './summarizeLlm'
import { periodSummaries, userProfile } from './schema'

export const USER_PROFILE_ID = 'default'
/** 经常性行为上限 */
export const FREQUENT_BEHAVIORS_MAX = 10

export type UserProfileView = {
  id: string
  interests: string
  summary: string
  personality: string
  age: string
  addressName: string
  attitudeToNeko: string
  frequentBehaviors: string[]
  /** 最近一次驱动更新的 period id（现为月总结 id；列名历史为 source_weekly_id） */
  sourceWeeklyId: string | null
  updatedAt: Date
}

const MONTHLY_PROFILE_SYSTEM = `你是用户画像助手。根据月总结与已有画像（可空），创建或更新完整用户画像，只输出 JSON，不要 Markdown。
格式：
{"interests":"兴趣爱好简述","summary":"总体画像一两句","personality":"性格","age":"未知或年龄","address_name":"未知或称呼","attitude_to_neko":"对猫娘态度","frequent_behaviors":["经常性行为1","经常性行为2"]}
规则：未知填「未知」；frequent_behaviors 最多 ${FREQUENT_BEHAVIORS_MAX} 条短句；无依据勿编造。`

export function clampFrequentBehaviors(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : []
  return list
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 120))
    .slice(0, FREQUENT_BEHAVIORS_MAX)
}

export function getUserProfile(db: MemoryDatabase): UserProfileView | null {
  const row = db.select().from(userProfile).where(eq(userProfile.id, USER_PROFILE_ID)).get()
  if (!row) return null
  return {
    id: row.id,
    interests: row.interests,
    summary: row.summary,
    personality: row.personality,
    age: row.age,
    addressName: row.addressName,
    attitudeToNeko: row.attitudeToNeko,
    frequentBehaviors: clampFrequentBehaviors(row.frequentBehaviors),
    sourceWeeklyId: row.sourceWeeklyId,
    updatedAt: row.updatedAt
  }
}

export function formatUserProfileBlock(profile: UserProfileView | null): string {
  if (!profile) return ''
  const behaviors = clampFrequentBehaviors(profile.frequentBehaviors)
  const hasBody =
    profile.summary.trim() ||
    profile.interests.trim() ||
    profile.personality.trim() ||
    profile.attitudeToNeko.trim() ||
    (profile.age && profile.age !== '未知') ||
    (profile.addressName && profile.addressName !== '未知') ||
    behaviors.length > 0
  if (!hasBody) return ''

  const lines = ['【用户画像｜务必记住】']
  if (profile.summary.trim()) lines.push(`总体：${profile.summary.trim()}`)
  if (profile.interests.trim()) lines.push(`兴趣：${profile.interests.trim()}`)
  if (profile.personality.trim()) lines.push(`性格：${profile.personality.trim()}`)
  lines.push(`年龄：${profile.age || '未知'}`)
  lines.push(`称呼：${profile.addressName || '未知'}`)
  if (profile.attitudeToNeko.trim()) lines.push(`对猫娘：${profile.attitudeToNeko.trim()}`)
  if (behaviors.length > 0) {
    lines.push(`经常性行为：${behaviors.join('；')}`)
  }
  return lines.join('\n')
}

function parseFullProfileJson(content: string): {
  interests: string
  summary: string
  personality: string
  age: string
  addressName: string
  attitudeToNeko: string
  frequentBehaviors: string[]
} {
  const raw = extractJsonObject(content) as Record<string, unknown>
  const str = (k: string, fallback = '') =>
    typeof raw[k] === 'string' ? (raw[k] as string).trim() : fallback
  const behaviorsRaw = Array.isArray(raw.frequent_behaviors)
    ? raw.frequent_behaviors
    : Array.isArray(raw.frequentBehaviors)
      ? raw.frequentBehaviors
      : []
  return {
    interests: str('interests').slice(0, 400),
    summary: str('summary').slice(0, 600),
    personality: str('personality').slice(0, 200),
    age: str('age', '未知').slice(0, 40) || '未知',
    addressName: (str('address_name') || str('addressName', '未知')).slice(0, 40) || '未知',
    attitudeToNeko: (str('attitude_to_neko') || str('attitudeToNeko')).slice(0, 200),
    frequentBehaviors: clampFrequentBehaviors(behaviorsRaw)
  }
}

/**
 * 月总结成功后：创建或更新完整用户画像（全部字段，含 frequent_behaviors≤10）。
 * 周总结不调用本函数。失败抛错，调用方不回滚月总结。
 */
export async function upsertUserProfileFromMonthly(
  db: MemoryDatabase,
  monthlyId: string
): Promise<boolean> {
  const monthly = db.select().from(periodSummaries).where(eq(periodSummaries.id, monthlyId)).get()
  if (!monthly || monthly.kind !== 'monthly') {
    logWarn('memory', 'upsertUserProfileFromMonthly: monthly not found', monthlyId)
    return false
  }

  const existing = getUserProfile(db)
  const prev = existing
    ? JSON.stringify({
        interests: existing.interests,
        summary: existing.summary,
        personality: existing.personality,
        age: existing.age,
        address_name: existing.addressName,
        attitude_to_neko: existing.attitudeToNeko,
        frequent_behaviors: existing.frequentBehaviors
      })
    : '（尚无画像）'

  const messages: ChatHistoryMessage[] = [
    { role: 'system', content: MONTHLY_PROFILE_SYSTEM },
    {
      role: 'user',
      content: `已有画像：\n${prev}\n\n本月总结：\n${monthly.summary}\n要点：${(monthly.keyFacts ?? []).join('；')}\n关键词：${(monthly.keywords ?? []).join(',')}`
    }
  ]

  const content = await completeMemoryChat(messages)
  const parsed = parseFullProfileJson(content)
  const now = new Date()

  db.insert(userProfile)
    .values({
      id: USER_PROFILE_ID,
      interests: parsed.interests,
      summary: parsed.summary,
      personality: parsed.personality,
      age: parsed.age,
      addressName: parsed.addressName,
      attitudeToNeko: parsed.attitudeToNeko,
      frequentBehaviors: parsed.frequentBehaviors,
      sourceWeeklyId: monthlyId,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: userProfile.id,
      set: {
        interests: parsed.interests,
        summary: parsed.summary,
        personality: parsed.personality,
        age: parsed.age,
        addressName: parsed.addressName,
        attitudeToNeko: parsed.attitudeToNeko,
        frequentBehaviors: parsed.frequentBehaviors,
        sourceWeeklyId: monthlyId,
        updatedAt: now
      }
    })
    .run()

  logInfo('memory', 'user profile upserted from monthly', `monthlyId=${monthlyId}`)
  return true
}
