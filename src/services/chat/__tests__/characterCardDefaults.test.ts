import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CHARACTER_CARD_LIKES,
  DEFAULT_CHARACTER_CARD_NAME,
  DEFAULT_CHARACTER_CARD_ROLE_PROMPT,
  createDefaultCharacterCard,
  formatCharacterCardListLabel,
  mergeDefaultCharacterCardTemplate
} from '../characterCardDefaults'
import { DEFAULT_CHARACTER_CARD_ID } from '../types'

describe('characterCardDefaults', () => {
  it('creates the shipped default card template', () => {
    const card = createDefaultCharacterCard('2026-01-01T00:00:00.000Z')
    expect(card).toMatchObject({
      id: DEFAULT_CHARACTER_CARD_ID,
      name: DEFAULT_CHARACTER_CARD_NAME,
      rolePrompt: DEFAULT_CHARACTER_CARD_ROLE_PROMPT,
      likes: DEFAULT_CHARACTER_CARD_LIKES
    })
  })

  it('fills only empty fields when migrating legacy blank default card', () => {
    const legacy = createDefaultCharacterCard()
    legacy.name = ''
    legacy.rolePrompt = ''
    legacy.likes = ''

    const merged = mergeDefaultCharacterCardTemplate(legacy)
    expect(merged.name).toBe(DEFAULT_CHARACTER_CARD_NAME)
    expect(merged.rolePrompt).toBe(DEFAULT_CHARACTER_CARD_ROLE_PROMPT)
    expect(merged.likes).toBe(DEFAULT_CHARACTER_CARD_LIKES)
  })

  it('does not overwrite customized default card fields', () => {
    const customized = createDefaultCharacterCard()
    customized.rolePrompt = '用户自定义人设'
    const merged = mergeDefaultCharacterCardTemplate(customized)
    expect(merged.rolePrompt).toBe('用户自定义人设')
  })

  it('labels default slot with fixed list name', () => {
    const card = createDefaultCharacterCard()
    expect(formatCharacterCardListLabel(card)).toBe('默认角色卡')
    expect(formatCharacterCardListLabel({ ...card, id: 'other', name: '副卡' })).toBe('副卡')
  })
})
