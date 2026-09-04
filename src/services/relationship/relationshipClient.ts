/**
 * 渲染侧好感 IPC：会话缓冲鉴定、注入、快照。
 * 门闩只认插件总闸 desireEnabled；relationshipEnabled 仅为配置镜像，勿当开关读。
 * 鉴定必须 F&F（不进 consolidateChain）；满 3 轮 / 关窗 flush 都禁止 await IPC。
 */
import { scheduleMemoryBackground } from '../memory/scheduleMemoryBackground'
import { createRelationshipTurnBuffer, type RelChatRound } from './turnBuffer'

export type RelationshipSnapshotView = {
  scores: { closeness: number; trust: number; rapport: number }
  tags: { closeness: string; trust: string; rapport: string }
  netToday: { closeness: number; trust: number; rapport: number }
}

const buffer = createRelationshipTurnBuffer()

export async function getRelationshipPromptBlock(): Promise<string> {
  try {
    const result = await window.electronAPI?.relationshipGetPromptBlock?.()
    if (!result || !result.ok) return ''
    return result.block?.trim() ?? ''
  } catch {
    return ''
  }
}

export async function getRelationshipSnapshot(nowMs?: number): Promise<RelationshipSnapshotView | null> {
  try {
    const result = await window.electronAPI?.relationshipGetSnapshot?.(
      nowMs != null ? { nowMs } : undefined
    )
    if (!result || !result.ok) return null
    return {
      scores: result.scores,
      tags: result.tags,
      netToday: result.netToday
    }
  } catch {
    return null
  }
}

export async function getRelationshipStatus(): Promise<{
  ready: boolean
  memoryEnabled: boolean
  relationshipEnabled: boolean
  active: boolean
}> {
  try {
    const s = await window.electronAPI?.relationshipGetStatus?.()
    if (!s) {
      return { ready: false, memoryEnabled: false, relationshipEnabled: true, active: false }
    }
    return s
  } catch {
    return { ready: false, memoryEnabled: false, relationshipEnabled: true, active: false }
  }
}

function fireEval(rounds: RelChatRound[], source: 'llm_turn' | 'chat_close'): void {
  // 故意不 await：与满轮总结并行抢模型可以，卡在 sending 上不行
  scheduleMemoryBackground('relationship-eval', () =>
    window.electronAPI?.relationshipApplyEval?.({ rounds, source })
  )
}

/** 一轮结束：满 3 轮则后台鉴定并清空这批（发起即清，LLM 失败不回灌） */
export function noteRelationshipRoundMaybeEval(round: RelChatRound): void {
  const batch = buffer.push(round)
  if (batch) fireEval(batch, 'llm_turn')
}

/** 关窗：把未满 3 轮的剩余对话立刻送去鉴定 */
export function flushRelationshipOnChatClose(): void {
  const batch = buffer.flush()
  if (batch) fireEval(batch, 'chat_close')
}

export function resetRelationshipTurnBuffer(): void {
  buffer.clear()
}
