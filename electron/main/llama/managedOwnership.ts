/**
 * llama-server 进程所有权（OPT-03）。
 *
 * 状态图见同目录 CONTRACT.md。
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

/** 关窗 L-delay 结束时：是否清当前内存态（仅当仍指向关窗快照 pid 时）。 */
export type SnapshotStopDecision = {
  pidToKill: number | null
  clearRuntime: boolean
}

/** 关聊天窗时：仅本应用 spawn 的进程可 kill；不读 pid 文件。 */
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
 * L-delay 专用：只杀关窗瞬间的 pid；若期间已 begin 出新进程则不清 runtime、不误杀新 pid。
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
