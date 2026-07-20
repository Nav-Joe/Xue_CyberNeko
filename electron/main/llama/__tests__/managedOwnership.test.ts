import { describe, expect, it } from 'vitest'

import { decideStopAction, isManagedLlamaRunning } from '../managedOwnership'
import { createSingleFlight } from '../singleFlight'

describe('decideStopAction（kill 真值表 · 不读 pid 文件）', () => {
  it('none → 不 kill', () => {
    expect(decideStopAction({ ownership: 'none', managedPid: 12345 })).toEqual({
      shouldKill: false,
      pid: null,
      reason: 'not_app_owned'
    })
  })

  it('external → 绝不 kill（即使有 managedPid）', () => {
    expect(decideStopAction({ ownership: 'external', managedPid: 999 })).toEqual({
      shouldKill: false,
      pid: null,
      reason: 'not_app_owned'
    })
  })

  it('app_spawned 无 pid → 不 kill', () => {
    expect(decideStopAction({ ownership: 'app_spawned', managedPid: null })).toEqual({
      shouldKill: false,
      pid: null,
      reason: 'app_owned_but_no_pid'
    })
  })

  it('app_spawned + pid → kill 该内存 pid', () => {
    expect(decideStopAction({ ownership: 'app_spawned', managedPid: 4242 })).toEqual({
      shouldKill: true,
      pid: 4242,
      reason: 'app_spawned'
    })
  })
})

describe('isManagedLlamaRunning（仅内存 ownership）', () => {
  it('app_spawned + 存活句柄 → true', () => {
    expect(
      isManagedLlamaRunning({
        ownership: 'app_spawned',
        managedProcess: { killed: false, exitCode: null }
      })
    ).toBe(true)
  })

  it('external 即使有句柄 → false（不把外部当本应用托管）', () => {
    expect(
      isManagedLlamaRunning({
        ownership: 'external',
        managedProcess: { killed: false, exitCode: null }
      })
    ).toBe(false)
  })

  it('app_spawned 但进程已退出 → false', () => {
    expect(
      isManagedLlamaRunning({
        ownership: 'app_spawned',
        managedProcess: { killed: false, exitCode: 1 }
      })
    ).toBe(false)
  })

  it('none / 无句柄 → false', () => {
    expect(isManagedLlamaRunning({ ownership: 'none', managedProcess: null })).toBe(false)
    expect(
      isManagedLlamaRunning({ ownership: 'app_spawned', managedProcess: null })
    ).toBe(false)
  })
})

describe('createSingleFlight · 并发调用只 spawn 一次', () => {
  it('三个并发调用共享第一次结果，spawn 计数为 1', async () => {
    const run = createSingleFlight<string>()
    let spawnCount = 0

    const spawnOnce = () =>
      run(async () => {
        spawnCount += 1
        await new Promise((r) => setTimeout(r, 40))
        return `spawned-${spawnCount}`
      })

    const [a, b, c] = await Promise.all([spawnOnce(), spawnOnce(), spawnOnce()])

    expect(spawnCount).toBe(1)
    expect(a).toBe('spawned-1')
    expect(b).toBe('spawned-1')
    expect(c).toBe('spawned-1')
  })

  it('上一轮结束后可再次 spawn', async () => {
    const run = createSingleFlight<number>()
    let spawnCount = 0

    const spawnOnce = () =>
      run(async () => {
        spawnCount += 1
        return spawnCount
      })

    expect(await spawnOnce()).toBe(1)
    expect(await spawnOnce()).toBe(2)
    expect(spawnCount).toBe(2)
  })
})
