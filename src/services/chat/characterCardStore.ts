import {
  deleteCharacterCard,
  normalizeCharacterCardsStore,
  setActiveCharacterCard,
  upsertCharacterCard
} from './characterCardMutations'
import type { CharacterCard, CharacterCardsStore } from './types'

/** IPC structured clone 不接受 Vue Proxy，写入前转为纯对象 */
export function cloneCharacterCardsStore(store: CharacterCardsStore): CharacterCardsStore {
  return JSON.parse(JSON.stringify(store)) as CharacterCardsStore
}

export function cloneCharacterCard(card: CharacterCard): CharacterCard {
  return JSON.parse(JSON.stringify(card)) as CharacterCard
}

export async function loadCharacterCardsStore(): Promise<CharacterCardsStore> {
  if (!window.electronAPI?.readCharacterCards) {
    throw new Error('当前环境不支持角色卡持久化')
  }
  const store = await window.electronAPI.readCharacterCards()
  return normalizeCharacterCardsStore(store)
}

export async function saveCharacterCardsStore(store: CharacterCardsStore): Promise<CharacterCardsStore> {
  if (!window.electronAPI?.writeCharacterCards) {
    throw new Error('当前环境不支持角色卡持久化')
  }
  const normalized = normalizeCharacterCardsStore(cloneCharacterCardsStore(store))
  await window.electronAPI.writeCharacterCards(normalized)
  return normalized
}

export async function upsertAndSaveCharacterCard(
  store: CharacterCardsStore,
  card: CharacterCard
): Promise<CharacterCardsStore> {
  return saveCharacterCardsStore(upsertCharacterCard(cloneCharacterCardsStore(store), cloneCharacterCard(card)))
}

export async function deleteAndSaveCharacterCard(
  store: CharacterCardsStore,
  cardId: string
): Promise<CharacterCardsStore> {
  return saveCharacterCardsStore(deleteCharacterCard(cloneCharacterCardsStore(store), cardId))
}

export async function activateAndSaveCharacterCard(
  store: CharacterCardsStore,
  cardId: string
): Promise<CharacterCardsStore> {
  return saveCharacterCardsStore(setActiveCharacterCard(cloneCharacterCardsStore(store), cardId))
}

export { createBlankCharacterCard, getActiveCharacterCard } from './characterCardMutations'
