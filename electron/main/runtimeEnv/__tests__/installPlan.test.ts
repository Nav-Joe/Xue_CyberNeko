import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { live2dInstallPlan, runtimeInstallEnv } from '../installPlan'

describe('live2dInstallPlan', () => {
  const installRoot = join('D:\\repo')
  const dataRoot = join('D:\\repo')
  const separateData = join('C:\\Users\\x\\AppData\\Local\\xue-cyber-neko')
  const packagedInstall = join('C:\\app\\resources\\app-root')

  it('keeps npm when both roots are the repository', () => {
    const plan = live2dInstallPlan({
      installRoot,
      dataRoot,
      execPath: 'electron.exe'
    })
    expect(plan.command).toBe('cmd.exe')
    expect(plan.args.join(' ')).toContain('npm run setup:model')
    expect(plan.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(plan.env.XUE_PACKAGED).toBeUndefined()
    expect(plan.env.XUE_DATA_ROOT).toBe(dataRoot)
    expect(plan.env.XUE_INSTALL_ROOT).toBe(installRoot)
  })

  it('runs the download script with Electron when the roots differ', () => {
    const plan = live2dInstallPlan({
      installRoot: packagedInstall,
      dataRoot: separateData,
      execPath: join('C:\\app', 'Xue.exe')
    })
    expect(plan.command).toBe(join('C:\\app', 'Xue.exe'))
    expect(plan.args).toEqual([join(packagedInstall, 'scripts', 'download-sample-model.js')])
    expect(plan.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(plan.env.XUE_PACKAGED).toBe('1')
    expect(plan.env.XUE_DATA_ROOT).toBe(separateData)
    expect(plan.env.XUE_VENV_PYTHON).toBe(join(separateData, '.venv', 'Scripts', 'python.exe'))
  })
})

describe('runtimeInstallEnv', () => {
  it('points the interpreter at the data root venv', () => {
    const dataRoot = join('C:\\data')
    const env = runtimeInstallEnv(join('C:\\app'), dataRoot)
    expect(env.XUE_VENV_PYTHON).toBe(join(dataRoot, '.venv', 'Scripts', 'python.exe'))
  })
})
