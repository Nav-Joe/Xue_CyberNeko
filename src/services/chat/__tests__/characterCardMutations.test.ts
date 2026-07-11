import { describe, expect, it } from 'vitest'

import {
  createBlankCharacterCard,
  deleteCharacterCard,
  getActiveCharacterCard,
  normalizeCharacterCardsStore,
  orderCharacterCardsForDisplay,
  setActiveCharacterCard,
  upsertCharacterCard
} from '../characterCardMutations'
import { createDefaultCharacterCard } from '../characterCardDefaults'
import { DEFAULT_CHARACTER_CARD_ID } from '../types'

describe('characterCardMutations', () => {
  const baseStore = {
    activeCardId: DEFAULT_CHARACTER_CARD_ID,
    cards: [createDefaultCharacterCard('2026-01-01T00:00:00.000Z')]
  }

  it('ensures default slot exists with template content', () => {
    const store = normalizeCharacterCardsStore({ activeCardId: 'card_b', cards: [] })
    expect(store.cards[0]?.id).toBe(DEFAULT_CHARACTER_CARD_ID)
    expect(store.cards[0]?.name).toBe('雪澜')
    expect(store.cards[0]?.rolePrompt).toContain('猫娘')
  })

  it('keeps default slot first when custom cards exist', () => {
    const custom = createBlankCharacterCard('副卡', 'card_b')
    const store = normalizeCharacterCardsStore({
      activeCardId: 'card_b',
      cards: [custom, createDefaultCharacterCard()]
    })
    expect(store.cards.map((c) => c.id)).toEqual([DEFAULT_CHARACTER_CARD_ID, 'card_b'])
  })

  it('persists user edits on default slot without replacing custom cards', () => {
    const custom = createBlankCharacterCard('副卡', 'card_b')
    let store = normalizeCharacterCardsStore({
      activeCardId: DEFAULT_CHARACTER_CARD_ID,
      cards: [createDefaultCharacterCard(), custom]
    })
    store = upsertCharacterCard(store, {
      ...store.cards[0]!,
      rolePrompt: '用户改过的默认人设'
    })
    expect(store.cards).toHaveLength(2)
    expect(store.cards[0]?.rolePrompt).toBe('用户改过的默认人设')
    expect(store.cards[1]?.id).toBe('card_b')
  })

  it('upserts by id', () => {
    const updated = upsertCharacterCard(baseStore, {
      ...baseStore.cards[0],
      rolePrompt: '你是雪澜'
    })
    expect(updated.cards[0].rolePrompt).toBe('你是雪澜')
  })

  it('blocks deleting default card', () => {
    expect(() => deleteCharacterCard(baseStore, DEFAULT_CHARACTER_CARD_ID)).toThrow()
  })

  it('switches active card', () => {
    const extra = createBlankCharacterCard('副卡', 'card_b')
    const withExtra = upsertCharacterCard(baseStore, extra)
    const next = setActiveCharacterCard(withExtra, 'card_b')
    expect(getActiveCharacterCard(next)?.id).toBe('card_b')
  })
})
