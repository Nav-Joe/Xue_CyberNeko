import type { MemoryDatabase } from '../memory/dbCore'
import { renderPetTouchPromptBlock } from './prompt'
import { getPetTouchDay } from './store'

export function buildPetTouchPromptBlock(db: MemoryDatabase, nowMs = Date.now()): string {
  return renderPetTouchPromptBlock(getPetTouchDay(db, nowMs))
}
