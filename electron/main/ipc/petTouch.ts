import { ipcMain } from 'electron'

import { readChatConfigFile } from '../chat/chat-config'
import { readMemoryFlags } from '../memory/flags'
import { isMemoryReady, requireMemoryDb } from '../memory/runtime'
import { logWarn } from '../logging/logger'
import { getPetTouchDay, recordPetTouch } from '../petTouch/store'
import { buildPetTouchPromptBlock } from '../petTouch/runtime'
import { PET_TOUCH_PARTS, type PetTouchPart } from '../petTouch/types'

function asPart(raw: unknown): PetTouchPart | null {
  if (typeof raw !== 'string') return null
  return PET_TOUCH_PARTS.includes(raw as PetTouchPart) ? (raw as PetTouchPart) : null
}

/** 加亲近：记忆总闸 + 官方情感模拟插件；计数本身不看开关 */
function shouldGrantAffection(): boolean {
  if (!readMemoryFlags().memoryEnabled) return false
  try {
    return readChatConfigFile().desireEnabled !== false
  } catch {
    return true
  }
}

export function registerPetTouchIpc(): void {
  ipcMain.handle('pet-touch-get-today', (_event, payload?: { nowMs?: number }) => {
    if (!isMemoryReady()) return { ok: false as const, detail: 'memory_db_unavailable' }
    try {
      const nowMs = typeof payload?.nowMs === 'number' ? payload.nowMs : Date.now()
      const snapshot = getPetTouchDay(requireMemoryDb(), nowMs)
      return { ok: true as const, ...snapshot, affectionEnabled: shouldGrantAffection() }
    } catch (error) {
      logWarn('petTouch', 'pet-touch-get-today failed', error)
      return { ok: false as const, detail: 'pet_touch_get_failed' }
    }
  })

  /** 发消息前只读注入；不另开 LLM */
  ipcMain.handle('pet-touch-get-prompt-block', (_event, payload?: { nowMs?: number }) => {
    if (!isMemoryReady()) return { ok: false as const, detail: 'memory_db_unavailable', block: '' }
    try {
      const nowMs = typeof payload?.nowMs === 'number' ? payload.nowMs : Date.now()
      const block = buildPetTouchPromptBlock(requireMemoryDb(), nowMs)
      return { ok: true as const, block }
    } catch (error) {
      logWarn('petTouch', 'pet-touch-get-prompt-block failed', error)
      return { ok: false as const, detail: 'pet_touch_prompt_failed', block: '' }
    }
  })

  ipcMain.handle(
    'pet-touch-record',
    (_event, payload?: { part?: string; nowMs?: number }) => {
      if (!isMemoryReady()) return { ok: false as const, detail: 'memory_db_unavailable' }
      const part = asPart(payload?.part)
      if (!part) return { ok: false as const, detail: 'invalid_part' }
      try {
        const nowMs = typeof payload?.nowMs === 'number' ? payload.nowMs : Date.now()
        const result = recordPetTouch(requireMemoryDb(), part, {
          nowMs,
          grantAffection: shouldGrantAffection()
        })
        return {
          ok: true as const,
          ...result,
          affectionEnabled: shouldGrantAffection()
        }
      } catch (error) {
        logWarn('petTouch', 'pet-touch-record failed', error)
        return { ok: false as const, detail: 'pet_touch_record_failed' }
      }
    }
  )
}
