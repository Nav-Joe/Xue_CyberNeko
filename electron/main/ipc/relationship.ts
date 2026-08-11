import { ipcMain } from 'electron'

import { readChatConfigFile } from '../chat/chat-config'
import { runRelationshipEval } from '../relationship/eval'
import { buildRelationshipPromptBlock } from '../relationship/runtime'
import { buildRelationshipSnapshot } from '../relationship/snapshot'
import type { RelChatRound } from '../relationship/relationshipLlm'
import { isMemoryReady, requireMemoryDb } from '../memory/runtime'
import { readMemoryFlags } from '../memory/flags'
import { logWarn } from '../logging/logger'

function relationshipGate(): { ok: true } | { ok: false; detail: string } {
  if (!isMemoryReady()) return { ok: false, detail: 'memory_db_unavailable' }
  const memory = readMemoryFlags()
  if (!memory.memoryEnabled) return { ok: false, detail: 'memory_disabled' }
  try {
    // 好感门闩只认官方情感模拟插件总闸（desireEnabled）；勿改读 relationshipEnabled
    const pluginOn = readChatConfigFile().desireEnabled !== false
    if (!pluginOn) return { ok: false, detail: 'relationship_disabled' }
  } catch {
    return { ok: false, detail: 'relationship_config_unavailable' }
  }
  return { ok: true }
}

function normalizeRounds(raw: unknown): RelChatRound[] {
  if (!Array.isArray(raw)) return []
  const out: RelChatRound[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    out.push({
      userText: typeof r.userText === 'string' ? r.userText : '',
      assistantText: typeof r.assistantText === 'string' ? r.assistantText : ''
    })
  }
  return out
}

export function registerRelationshipIpc(): void {
  ipcMain.handle('relationship-get-status', () => {
    let pluginOn = true
    try {
      pluginOn = readChatConfigFile().desireEnabled !== false
    } catch {
      pluginOn = true
    }
    const memory = readMemoryFlags()
    return {
      ready: isMemoryReady(),
      memoryEnabled: memory.memoryEnabled,
      /** 与官方情感模拟插件总闸一致 */
      relationshipEnabled: pluginOn,
      active: isMemoryReady() && memory.memoryEnabled && pluginOn
    }
  })

  /** 发消息前只读注入；不改分 */
  ipcMain.handle('relationship-get-prompt-block', () => {
    const gate = relationshipGate()
    if (!gate.ok) return { ok: false as const, detail: gate.detail, block: '' }
    try {
      const block = buildRelationshipPromptBlock(requireMemoryDb())
      return { ok: true as const, block }
    } catch (error) {
      logWarn('relationship', 'relationship-get-prompt-block failed', error)
      return { ok: false as const, detail: 'relationship_prompt_failed', block: '' }
    }
  })

  /** 只读面板快照（分 / TAG / 今日净变化） */
  ipcMain.handle('relationship-get-snapshot', (_event, payload?: { nowMs?: number }) => {
    const gate = relationshipGate()
    if (!gate.ok) return { ok: false as const, detail: gate.detail }
    try {
      const nowMs = typeof payload?.nowMs === 'number' ? payload.nowMs : Date.now()
      const snapshot = buildRelationshipSnapshot(requireMemoryDb(), nowMs)
      return { ok: true as const, ...snapshot }
    } catch (error) {
      logWarn('relationship', 'relationship-get-snapshot failed', error)
      return { ok: false as const, detail: 'relationship_snapshot_failed' }
    }
  })

  /** 满 3 轮或关窗时后台鉴定；主进程调 LLM 并写库 */
  ipcMain.handle(
    'relationship-apply-eval',
    async (
      _event,
      payload?: {
        rounds?: RelChatRound[]
        source?: 'llm_turn' | 'chat_close'
      }
    ) => {
      const gate = relationshipGate()
      if (!gate.ok) return { ok: false as const, detail: gate.detail }
      const rounds = normalizeRounds(payload?.rounds)
      const source = payload?.source === 'chat_close' ? 'chat_close' : 'llm_turn'
      if (rounds.length === 0) return { ok: true as const, skipped: 'empty_rounds' }
      try {
        return await runRelationshipEval(requireMemoryDb(), { rounds, source })
      } catch (error) {
        logWarn('relationship', 'relationship-apply-eval failed', error)
        return { ok: false as const, detail: 'eval_failed' }
      }
    }
  )
}
