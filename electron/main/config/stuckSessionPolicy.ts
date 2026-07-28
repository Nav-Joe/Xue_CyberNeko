/**
 * Reconcile #8：卡住的音色工坊 session 要不要清掉（Electron / Python 同一张表）。
 *
 * Electron：`reconcile.ts` 调用本文件。
 * Python：`voice_runtime_repair._should_clear_stuck_session` 须与本表一致。
 * 说明见 `CONTRACT.md`「卡住 session 清理真相表」。
 */

export type StuckSessionPhase =
  | 'pending_restart'
  | 'generating'
  | 'awaiting_review'
  | 'prewarming'
  | 'completed'
  | 'cancelled'

/**
 * 卡住 session 清理表（与 touch mode 无关）：
 * - awaiting_review：保留（待审）
 * - cancelled：不清（交给 Electron 规则 #1 做产品取消）
 * - completed：不清
 * - prewarming：必清
 * - pending_restart / generating：样本齐则留，不齐则清
 * - 其它未知 phase：当卡住清掉
 */
export function shouldClearStuckSession(input: {
  flow: string | null | undefined
  phase: string | null | undefined
  sampleReady: boolean
}): boolean {
  if (input.flow !== 'create_voice') return false
  const phase = input.phase
  if (phase === 'awaiting_review') return false
  if (phase === 'cancelled' || phase === 'completed') return false
  if (phase === 'prewarming') return true
  if (phase === 'pending_restart' || phase === 'generating') {
    return !input.sampleReady
  }
  return true
}

/** @deprecated 使用 shouldClearStuckSession（两端已统一） */
export const shouldClearStuckSessionElectron = shouldClearStuckSession

/** @deprecated 使用 shouldClearStuckSession（两端已统一；忽略 touchMode） */
export function shouldClearStuckSessionPython(input: {
  flow: string | null | undefined
  phase: string | null | undefined
  touchMode?: string
  sampleReady: boolean
}): boolean {
  return shouldClearStuckSession({
    flow: input.flow,
    phase: input.phase,
    sampleReady: input.sampleReady
  })
}
