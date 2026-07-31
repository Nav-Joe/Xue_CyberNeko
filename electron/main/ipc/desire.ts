import { ipcMain } from 'electron'

import { readChatConfigFile } from '../chat/chat-config'
import { runDesireAfterTurn } from '../desire/afterTurn'
import { buildDesirePromptBlock } from '../desire/runtime'
import { insertDesireForTest } from '../desire/store'
import { isMemoryReady, requireMemoryDb } from '../memory/runtime'
import { readMemoryFlags } from '../memory/flags'
import { logWarn } from '../logging/logger'

function desireGate(): { ok: true } | { ok: false; detail: string } {
  if (!isMemoryReady()) return { ok: false, detail: 'memory_db_unavailable' }
  const memory = readMemoryFlags()
  if (!memory.memoryEnabled) return { ok: false, detail: 'memory_disabled' }
  try {
    const desireEnabled = readChatConfigFile().desireEnabled !== false
    if (!desireEnabled) return { ok: false, detail: 'desire_disabled' }
  } catch {
    return { ok: false, detail: 'desire_config_unavailable' }
  }
  return { ok: true }
}

export function registerDesireIpc(): void {
  ipcMain.handle('desire-get-status', () => {
    let desireEnabled = true
    try {
      desireEnabled = readChatConfigFile().desireEnabled !== false
    } catch {
      desireEnabled = true
    }
    const memory = readMemoryFlags()
    return {
      ready: isMemoryReady(),
      memoryEnabled: memory.memoryEnabled,
      desireEnabled,
      /** 记忆就绪且记忆/欲望均开时才可注入 */
      active: isMemoryReady() && memory.memoryEnabled && desireEnabled
    }
  })

  ipcMain.handle('desire-get-prompt-block', (_event, payload?: { nowMs?: number }) => {
    const gate = desireGate()
    if (!gate.ok) return { ok: false as const, detail: gate.detail, block: '' }
    try {
      const block = buildDesirePromptBlock(requireMemoryDb(), {
        nowMs: typeof payload?.nowMs === 'number' ? payload.nowMs : undefined
      })
      return { ok: true as const, block }
    } catch (error) {
      logWarn('desire', 'desire-get-prompt-block failed', error)
      return { ok: false as const, detail: 'desire_prompt_failed', block: '' }
    }
  })

  /** 调试插入；正式创建走轮后 LLM 提议 */
  ipcMain.handle(
    'desire-insert-test',
    (
      _event,
      payload?: {
        name?: string
        description?: string
        intensity?: number
        patienceMax?: number
        patienceRemaining?: number
      }
    ) => {
      const gate = desireGate()
      if (!gate.ok) return gate
      const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
      if (!name) return { ok: false as const, detail: 'invalid_payload' }
      try {
        const row = insertDesireForTest(requireMemoryDb(), {
          name,
          description: payload?.description,
          intensity: payload?.intensity,
          patienceMax: payload?.patienceMax,
          patienceRemaining: payload?.patienceRemaining
        })
        return { ok: true as const, id: row.id }
      } catch (error) {
        logWarn('desire', 'desire-insert-test failed', error)
        return { ok: false as const, detail: 'desire_insert_failed' }
      }
    }
  )

  /** 轮后后台鉴定；主进程调 LLM 并写库，失败静默 */
  ipcMain.handle(
    'desire-apply-after-turn',
    async (
      _event,
      payload?: { userText?: string; assistantText?: string }
    ) => {
      const gate = desireGate()
      if (!gate.ok) return { ok: false as const, detail: gate.detail }
      const assistantText = typeof payload?.assistantText === 'string' ? payload.assistantText : ''
      const userText = typeof payload?.userText === 'string' ? payload.userText : ''
      if (!assistantText.trim()) return { ok: true as const, skipped: 'empty_assistant' }
      try {
        return await runDesireAfterTurn(requireMemoryDb(), { userText, assistantText })
      } catch (error) {
        logWarn('desire', 'desire-apply-after-turn failed', error)
        return { ok: false as const, detail: 'after_turn_failed' }
      }
    }
  )
}
