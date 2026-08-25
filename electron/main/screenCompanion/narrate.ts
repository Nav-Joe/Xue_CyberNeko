/**
 * 看屏旁白：用聊天同一套 LLM 配置生成短句；不读记忆、不写进用户聊天。
 */
import { readCharacterCardsFile } from '../chat/character-cards'
import { completeMemoryChat } from '../memory/summarizeLlm'
import { formatCharacterSystemPrompt } from '../../../src/services/chat/promptBuilder'
import type { ChatHistoryMessage } from '../../../src/services/chat/types'
import { logInfo, logWarn } from '../logging/logger'
import type { ScreenObservation } from './types'

const NARRATE_TIMEOUT_HINT =
  '一句到两句口语旁白，适合 TTS；可提可不提屏幕内容；不要 Markdown；只输出旁白正文。'

function resolveActiveRolePrompt(): string {
  const store = readCharacterCardsFile()
  const card =
    store.cards.find((c) => c.id === store.activeCardId) ?? store.cards[0] ?? null
  if (!card) return ''
  return formatCharacterSystemPrompt({
    id: card.id,
    name: card.name,
    rolePrompt: card.rolePrompt,
    likes: card.likes,
    ragDocumentIds: card.ragDocumentIds,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt
  })
}

function buildNarrateMessages(input: {
  gameName: string
  observation: ScreenObservation
}): ChatHistoryMessage[] {
  const role = resolveActiveRolePrompt()
  const summary = input.observation.summary.trim()
  const system = [
    role,
    '【看屏旁白·非聊天会话】',
    '你在看用户玩 Steam 游戏，根据下方信息说一两句陪伴式口语旁白。',
    '这不是用户发来的聊天消息；不要以对话口吻等待用户回复。',
    NARRATE_TIMEOUT_HINT,
    `当前游戏：${input.gameName}`,
    `屏幕摘要：${summary}`
  ]
    .filter(Boolean)
    .join('\n\n')

  return [{ role: 'system', content: system }]
}

function normalizeNarrateLine(raw: string): string {
  return raw
    .replace(/^["「『]|["」』]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 生成旁白句；失败返回 null（本轮跳过 TTS） */
export async function generateCompanionNarrate(input: {
  gameName: string
  observation: ScreenObservation
}): Promise<string | null> {
  if (input.observation.usableForPrompt === false) return null
  const summary = input.observation.summary.trim()
  if (!summary) return null

  try {
    const messages = buildNarrateMessages(input)
    const raw = await completeMemoryChat(messages)
    const line = normalizeNarrateLine(raw)
    if (!line) {
      logWarn('screenCompanion', 'narrate empty after trim')
      return null
    }
    logInfo('screenCompanion', `narrate ok len=${line.length}`)
    return line
  } catch (error) {
    logWarn('screenCompanion', 'narrate LLM failed', error)
    return null
  }
}
