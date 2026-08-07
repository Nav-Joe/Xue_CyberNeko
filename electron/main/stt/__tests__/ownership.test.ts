import { describe, expect, it } from 'vitest'

import { decideSttProbeOwnership, decideSttStopAction } from '../ownership'

describe('stt ownership', () => {
  it('stop only kills app_spawned with pid', () => {
    expect(decideSttStopAction({ ownership: 'none', managedPid: 1 })).toEqual({
      shouldKill: false,
      pid: null,
      reason: 'not_app_owned'
    })
    expect(decideSttStopAction({ ownership: 'external', managedPid: 1 })).toEqual({
      shouldKill: false,
      pid: null,
      reason: 'not_app_owned'
    })
    expect(decideSttStopAction({ ownership: 'app_spawned', managedPid: null })).toEqual({
      shouldKill: false,
      pid: null,
      reason: 'app_owned_but_no_pid'
    })
    expect(decideSttStopAction({ ownership: 'app_spawned', managedPid: 42 })).toEqual({
      shouldKill: true,
      pid: 42,
      reason: 'app_spawned'
    })
  })

  it('probe marks external only from none', () => {
    expect(decideSttProbeOwnership({ ownership: 'none', healthy: true })).toBe('external')
    expect(decideSttProbeOwnership({ ownership: 'external', healthy: true })).toBeNull()
    expect(decideSttProbeOwnership({ ownership: 'app_spawned', healthy: true })).toBeNull()
    expect(decideSttProbeOwnership({ ownership: 'none', healthy: false })).toBeNull()
  })
})
