import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { ownershipAfterExit, planPackagedTtsLaunch, planTtsStop } from '../launchPlan'

const install = join('C:\\app\\resources\\app-root')
const data = join('C:\\Users\\x\\AppData\\Local\\xue-cyber-neko')
const python = join(data, '.venv', 'Scripts', 'python.exe')

describe('planPackagedTtsLaunch', () => {
  it('does nothing in dev so the startup script stays the only launcher', () => {
    const plan = planPackagedTtsLaunch({
      packaged: false,
      healthUp: false,
      pythonPath: null,
      importsOk: false,
      scriptExists: false,
      installRoot: install,
      dataRoot: install
    })
    expect(plan).toEqual({ action: 'leave-splash' })
  })

  it('leaves an already running server alone', () => {
    const plan = planPackagedTtsLaunch({
      packaged: true,
      healthUp: true,
      pythonPath: null,
      importsOk: false,
      scriptExists: true,
      installRoot: install,
      dataRoot: data
    })
    expect(plan).toEqual({ action: 'leave-splash' })
  })

  it('releases the splash when python, imports, or the script are missing', () => {
    const base = {
      packaged: true,
      healthUp: false,
      pythonPath: python,
      importsOk: true,
      scriptExists: true,
      installRoot: install,
      dataRoot: data
    }
    expect(planPackagedTtsLaunch({ ...base, pythonPath: null }).action).toBe('release-splash')
    expect(planPackagedTtsLaunch({ ...base, importsOk: false }).action).toBe('release-splash')
    expect(planPackagedTtsLaunch({ ...base, scriptExists: false }).action).toBe('release-splash')
  })

  it('spawns tts_server with the data root when the port is free', () => {
    const plan = planPackagedTtsLaunch({
      packaged: true,
      healthUp: false,
      pythonPath: python,
      importsOk: true,
      scriptExists: true,
      installRoot: install,
      dataRoot: data
    })
    expect(plan).toEqual({
      action: 'spawn',
      python,
      script: join(install, 'tts_voice', 'tts_server.py'),
      cwd: install,
      env: {
        XUE_DATA_ROOT: data,
        XUE_INSTALL_ROOT: install,
        XUE_VENV_PYTHON: python,
        XUE_PACKAGED: '1'
      }
    })
  })
})

describe('planTtsStop', () => {
  it('kills only the process this app spawned', () => {
    expect(planTtsStop({ ownership: 'app_spawned', pid: 42 })).toEqual({
      shouldKill: true,
      pid: 42
    })
    expect(planTtsStop({ ownership: 'none', pid: null }).shouldKill).toBe(false)
    expect(planTtsStop({ ownership: 'external', pid: 99 }).shouldKill).toBe(false)
    expect(planTtsStop({ ownership: 'app_spawned', pid: null }).shouldKill).toBe(false)
  })

  it('drops ownership after the child exits', () => {
    expect(ownershipAfterExit('app_spawned')).toBe('none')
    expect(ownershipAfterExit('external')).toBe('external')
    expect(ownershipAfterExit('none')).toBe('none')
  })
})
