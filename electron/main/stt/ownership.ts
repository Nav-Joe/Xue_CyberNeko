export type SttOwnership = 'none' | 'external' | 'app_spawned'

export type SttStopDecision = {
  shouldKill: boolean
  pid: number | null
  reason: 'not_app_owned' | 'app_owned_but_no_pid' | 'app_spawned'
}

/** 关总闸 / 退 App：仅 kill 本应用 spawn 的进程 */
export function decideSttStopAction(state: {
  ownership: SttOwnership
  managedPid: number | null
}): SttStopDecision {
  if (state.ownership !== 'app_spawned') {
    return { shouldKill: false, pid: null, reason: 'not_app_owned' }
  }
  if (state.managedPid === null) {
    return { shouldKill: false, pid: null, reason: 'app_owned_but_no_pid' }
  }
  return { shouldKill: true, pid: state.managedPid, reason: 'app_spawned' }
}

/** 探活已通时如何改 ownership（不 kill） */
export function decideSttProbeOwnership(state: {
  ownership: SttOwnership
  healthy: boolean
}): SttOwnership | null {
  if (!state.healthy) return null
  if (state.ownership === 'app_spawned') return null
  if (state.ownership === 'external') return null
  return 'external'
}
