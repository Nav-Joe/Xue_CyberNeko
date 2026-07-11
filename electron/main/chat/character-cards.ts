import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

import {
  createDefaultCharacterCard,
  mergeDefaultCharacterCardTemplate
} from '../../../src/services/chat/characterCardDefaults'
import {
  orderCharacterCardsForDisplay
} from '../../../src/services/chat/characterCardMutations'
import { DEFAULT_CHARACTER_CARD_ID } from '../../../src/services/chat/types'

export { DEFAULT_CHARACTER_CARD_ID }

export interface CharacterCardRecord {
  id: string
  name: string
  rolePrompt: string
  likes: string
  ragDocumentIds?: string[]
  createdAt: string
  updatedAt: string
}

export interface CharacterCardsFile {
  activeCardId: string
  cards: CharacterCardRecord[]
}

function cardsFilePath(): string {
  return join(app.getPath('userData'), 'character-cards.json')
}

function createDefaultCard(now = new Date().toISOString()): CharacterCardRecord {
  return createDefaultCharacterCard(now)
}

function normalizeCard(card: CharacterCardRecord): CharacterCardRecord {
  return mergeDefaultCharacterCardTemplate(card) as CharacterCardRecord
}

function normalizeStore(raw: CharacterCardsFile): CharacterCardsFile {
  const cards = Array.isArray(raw.cards)
    ? raw.cards.filter((c) => c && typeof c.id === 'string').map(normalizeCard)
    : []
  if (cards.length === 0) {
    const fallback = createDefaultCard()
    return { activeCardId: fallback.id, cards: [fallback] }
  }
  const activeCardId = cards.some((c) => c.id === raw.activeCardId)
    ? raw.activeCardId
    : cards[0]?.id ?? DEFAULT_CHARACTER_CARD_ID
  return { activeCardId, cards: orderCharacterCardsForDisplay(cards) }
}

export function readCharacterCardsFile(): CharacterCardsFile {
  const filePath = cardsFilePath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  if (!existsSync(filePath)) {
    const initial = normalizeStore({ activeCardId: DEFAULT_CHARACTER_CARD_ID, cards: [] })
    writeFileSync(filePath, `${JSON.stringify(initial, null, 2)}\n`, 'utf-8')
    return initial
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as CharacterCardsFile
    const normalized = normalizeStore(parsed)
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
    }
    return normalized
  } catch {
    const fallback = normalizeStore({ activeCardId: DEFAULT_CHARACTER_CARD_ID, cards: [] })
    writeFileSync(filePath, `${JSON.stringify(fallback, null, 2)}\n`, 'utf-8')
    return fallback
  }
}

export function writeCharacterCardsFile(store: CharacterCardsFile): CharacterCardsFile {
  const normalized = normalizeStore(store)
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(cardsFilePath(), `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  return normalized
}
