import {
  createDefaultCharacterCard,
  mergeDefaultCharacterCardTemplate
} from './characterCardDefaults'
import {
  DEFAULT_CHARACTER_CARD_ID,
  type CharacterCard,
  type CharacterCardsStore
} from './types'

export function createBlankCharacterCard(name: string, id?: string): CharacterCard {
  if (id === DEFAULT_CHARACTER_CARD_ID) {
    throw new Error('自定义角色卡不能使用默认槽位 id')
  }
  const now = new Date().toISOString()
  return {
    id: id ?? `card_${Date.now()}`,
    name,
    rolePrompt: '',
    likes: '',
    ragDocumentIds: [],
    createdAt: now,
    updatedAt: now
  }
}

/** 默认槽位固定置顶；其余按创建时间排序 */
export function orderCharacterCardsForDisplay(cards: CharacterCard[]): CharacterCard[] {
  const defaultCard = cards.find((c) => c.id === DEFAULT_CHARACTER_CARD_ID)
  const customCards = cards
    .filter((c) => c.id !== DEFAULT_CHARACTER_CARD_ID)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return defaultCard ? [defaultCard, ...customCards] : customCards
}

function ensureDefaultSlotPresent(store: CharacterCardsStore): CharacterCardsStore {
  const defaultCard = store.cards.find((c) => c.id === DEFAULT_CHARACTER_CARD_ID)
  if (defaultCard) {
    const merged = mergeDefaultCharacterCardTemplate(defaultCard)
    if (JSON.stringify(merged) === JSON.stringify(defaultCard)) {
      return store
    }
    return {
      ...store,
      cards: store.cards.map((c) => (c.id === DEFAULT_CHARACTER_CARD_ID ? merged : c))
    }
  }
  return {
    ...store,
    activeCardId: store.activeCardId || DEFAULT_CHARACTER_CARD_ID,
    cards: [createDefaultCharacterCard(), ...store.cards]
  }
}

/** 保证 default 槽位存在、置顶，且 activeId 有效 */
export function normalizeCharacterCardsStore(store: CharacterCardsStore): CharacterCardsStore {
  const withDefault = ensureDefaultSlotPresent(store)
  const cards = orderCharacterCardsForDisplay(withDefault.cards)
  const activeCardId = cards.some((c) => c.id === withDefault.activeCardId)
    ? withDefault.activeCardId
    : DEFAULT_CHARACTER_CARD_ID
  return { activeCardId, cards }
}

/** @deprecated 使用 normalizeCharacterCardsStore */
export function ensureDefaultCharacterCard(store: CharacterCardsStore): CharacterCardsStore {
  return normalizeCharacterCardsStore(store)
}

export function upsertCharacterCard(store: CharacterCardsStore, card: CharacterCard): CharacterCardsStore {
  const now = new Date().toISOString()
  const nextCard = { ...card, updatedAt: now }
  const index = store.cards.findIndex((c) => c.id === card.id)

  if (card.id !== DEFAULT_CHARACTER_CARD_ID && index < 0) {
    return normalizeCharacterCardsStore({
      ...store,
      cards: [...store.cards, nextCard]
    })
  }

  if (card.id === DEFAULT_CHARACTER_CARD_ID && index < 0) {
    return normalizeCharacterCardsStore({
      ...store,
      cards: [...store.cards, nextCard]
    })
  }

  const cards = store.cards.map((c, i) => (i === index ? { ...c, ...nextCard } : c))
  return normalizeCharacterCardsStore({ ...store, cards })
}

export function deleteCharacterCard(store: CharacterCardsStore, cardId: string): CharacterCardsStore {
  if (cardId === DEFAULT_CHARACTER_CARD_ID) {
    throw new Error('默认角色卡不可删除')
  }
  const cards = store.cards.filter((c) => c.id !== cardId)
  if (cards.length === store.cards.length) {
    return store
  }
  const activeCardId =
    store.activeCardId === cardId ? DEFAULT_CHARACTER_CARD_ID : store.activeCardId
  return normalizeCharacterCardsStore({ activeCardId, cards })
}

export function setActiveCharacterCard(store: CharacterCardsStore, cardId: string): CharacterCardsStore {
  if (!store.cards.some((c) => c.id === cardId)) {
    throw new Error('角色卡不存在')
  }
  return normalizeCharacterCardsStore({ ...store, activeCardId: cardId })
}

export function getActiveCharacterCard(store: CharacterCardsStore): CharacterCard | null {
  const normalized = normalizeCharacterCardsStore(store)
  return (
    normalized.cards.find((c) => c.id === normalized.activeCardId) ??
    normalized.cards.find((c) => c.id === DEFAULT_CHARACTER_CARD_ID) ??
    null
  )
}

export function isDefaultCharacterCard(card: CharacterCard): boolean {
  return card.id === DEFAULT_CHARACTER_CARD_ID
}
