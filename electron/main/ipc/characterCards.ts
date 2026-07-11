import { ipcMain } from 'electron'

import { readCharacterCardsFile, writeCharacterCardsFile, type CharacterCardsFile } from '../chat/character-cards'

export function registerCharacterCardsIpc(): void {
  ipcMain.handle('chat-read-character-cards', () => readCharacterCardsFile())

  ipcMain.handle('chat-write-character-cards', (_event, store: CharacterCardsFile) => {
    writeCharacterCardsFile(store)
    return { ok: true as const }
  })
}
