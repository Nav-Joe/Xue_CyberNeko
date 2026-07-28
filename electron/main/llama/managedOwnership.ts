/**
 * llama-server 进程所有权。
 *
 * 状态图与启停矩阵见同目录 CONTRACT.md。
 * pid 文件不参与本模块任何决策。
 */

export type LlamaOwnership = 'none' | 'external' | 'app_spawned'

export type ManagedProcessHandle = {
  killed?: boolean
  exitCode?: number | null
}

export type StopDecision = {
  shouldKill: boolean
  pid: number | null
  reason: 'not_app_owned' | 'app_owned_but_no_pid' | 'app_spawned'
}

/** 关窗整理结束后：是否清当前内存态（仅当仍指向关窗快照 pid 时）。 */
export type SnapshotStopDecision = {
  pidToKill: number | null
  clearRuntime: boolean
}

/** 关聊天窗时：仅本应用拉起的进程可 kill；不读 pid 文件。 */
export function decideStopAction(state: {
  ownership: LlamaOwnership
  managedPid: number | null
}): StopDecision {
  if (state.ownership !== 'app_spawned') {
    return { shouldKill: false, pid: null, reason: 'not_app_owned' }
  }
  if (state.managedPid === null) {
    return { shouldKill: false, pid: null, reason: 'app_owned_but_no_pid' }
  }
  return { shouldKill: true, pid: state.managedPid, reason: 'app_spawned' }
}

/**
 * 关窗延迟停机专用：只杀关窗瞬间的 pid；若期间已重新 begin 出新进程则不清 runtime、不误杀新 pid。
 */
export function decideSnapshotStopAction(state: {
  ownership: LlamaOwnership
  managedPid: number | null
  snapshotPid: number | null
}): SnapshotStopDecision {
  if (state.snapshotPid === null) {
    return { pidToKill: null, clearRuntime: false }
  }
  const stillSame =
    state.ownership === 'app_spawned' && state.managedPid === state.snapshotPid
  return { pidToKill: state.snapshotPid, clearRuntime: stillSame }
}

/**
 * 探测端口后如何改所有权（不 kill、不 spawn）。
 * - 端口已通且内存还是「没管」→ 记成「外部已有」，避免前端跳过 begin 后主进程仍以为没人管
 * - 端口不通且原先是「外部」→ 清回「没管」
 * - 本应用拉起的进程：探测不改所有权（避免启动中途误清）
 */
export function decideProbeOwnershipReconcile(state: {
  ownership: LlamaOwnership
  serverRunning: boolean
}): LlamaOwnership | null {
  if (state.serverRunning) {
    if (state.ownership === 'none') return 'external'
    return null
  }
  if (state.ownership === 'external') return 'none'
  return null
}

/**
 * 是否已有本应用托管的存活 llama 进程。
 * 只看内存 ownership + ChildProcess 句柄，不探测 pid 文件。
 */
export function isManagedLlamaRunning(state: {
  ownership: LlamaOwnership
  managedProcess: ManagedProcessHandle | null
}): boolean {
  if (state.ownership !== 'app_spawned') return false
  const child = state.managedProcess
  if (!child) return false
  if (child.killed) return false
  if (child.exitCode !== null && child.exitCode !== undefined) return false
  return true
}
