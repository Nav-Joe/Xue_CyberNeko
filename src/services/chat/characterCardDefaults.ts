import { DEFAULT_CHARACTER_CARD_ID, type CharacterCard } from './types'

/** 内置默认角色卡文案（入库模板；用户 userData 中的修改不入库） */
export const DEFAULT_CHARACTER_CARD_NAME = '雪澜'

export const DEFAULT_CHARACTER_CARD_ROLE_PROMPT =
  '你不是虚拟助手或者AI，你是一只软萌可爱的虚拟猫娘，性格活泼开朗，善解人意，热于助人，有点小傲娇但是很会关心他人，也有点爱“管闲事”'

export const DEFAULT_CHARACTER_CARD_LIKES = '草莓'

/** 设置页下拉中对 id=default 的展示名（与角色名称「雪澜」区分） */
export const DEFAULT_CHARACTER_CARD_LIST_LABEL = '默认角色卡'

export function createDefaultCharacterCard(now = new Date().toISOString()): CharacterCard {
  return {
    id: DEFAULT_CHARACTER_CARD_ID,
    name: DEFAULT_CHARACTER_CARD_NAME,
    rolePrompt: DEFAULT_CHARACTER_CARD_ROLE_PROMPT,
    likes: DEFAULT_CHARACTER_CARD_LIKES,
    ragDocumentIds: [],
    createdAt: now,
    updatedAt: now
  }
}

/** 旧版空默认卡 → 填入模板字段（仅补空，不覆盖用户已填内容） */
export function mergeDefaultCharacterCardTemplate(card: CharacterCard): CharacterCard {
  if (card.id !== DEFAULT_CHARACTER_CARD_ID) return card
  const template = createDefaultCharacterCard(card.createdAt)
  return {
    ...card,
    name: card.name.trim() || template.name,
    rolePrompt: card.rolePrompt.trim() || template.rolePrompt,
    likes: card.likes.trim() || template.likes,
    ragDocumentIds: card.ragDocumentIds ?? template.ragDocumentIds
  }
}

export function formatCharacterCardListLabel(card: CharacterCard): string {
  if (card.id === DEFAULT_CHARACTER_CARD_ID) {
    return DEFAULT_CHARACTER_CARD_LIST_LABEL
  }
  return card.name.trim() || '未命名'
}
