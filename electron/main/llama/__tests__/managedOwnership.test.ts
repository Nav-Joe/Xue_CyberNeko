import { describe, expect, it } from 'vitest'

import {
  decideProbeOwnershipReconcile,
  decideSnapshotStopAction,
  decideStopAction,
  isManagedLlamaRunning
} from '../managedOwnership'
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

describe('decideProbeOwnershipReconcile（探测对齐所有权）', () => {
  it('端口已通 + none → external', () => {
    expect(decideProbeOwnershipReconcile({ ownership: 'none', serverRunning: true })).toBe('external')
  })

  it('端口已通 + external / app_spawned → 不变', () => {
    expect(decideProbeOwnershipReconcile({ ownership: 'external', serverRunning: true })).toBeNull()
    expect(decideProbeOwnershipReconcile({ ownership: 'app_spawned', serverRunning: true })).toBeNull()
  })

  it('端口不通 + external → none', () => {
    expect(decideProbeOwnershipReconcile({ ownership: 'external', serverRunning: false })).toBe('none')
  })

  it('端口不通 + app_spawned / none → 不变（避免启动中途误清）', () => {
    expect(decideProbeOwnershipReconcile({ ownership: 'app_spawned', serverRunning: false })).toBeNull()
    expect(decideProbeOwnershipReconcile({ ownership: 'none', serverRunning: false })).toBeNull()
  })
})

describe('decideSnapshotStopAction（关窗延迟停机只杀快照 pid）', () => {
  it('snapshot null → 不 kill、不清 runtime', () => {
    expect(
      decideSnapshotStopAction({
        ownership: 'app_spawned',
        managedPid: 99,
        snapshotPid: null
      })
    ).toEqual({ pidToKill: null, clearRuntime: false })
  })

  it('仍是同一 pid → kill 且 clearRuntime', () => {
    expect(
      decideSnapshotStopAction({
        ownership: 'app_spawned',
        managedPid: 4242,
        snapshotPid: 4242
      })
    ).toEqual({ pidToKill: 4242, clearRuntime: true })
  })

  it('已 begin 出新 pid → 只杀旧 pid，不清 runtime', () => {
    expect(
      decideSnapshotStopAction({
        ownership: 'app_spawned',
        managedPid: 7777,
        snapshotPid: 4242
      })
    ).toEqual({ pidToKill: 4242, clearRuntime: false })
  })

  it('ownership 已是 external 但仍有旧快照 → 仍杀快照 pid，不清 runtime', () => {
    // 关窗时是 app_spawned；延迟期间所有权若变成 external，也不要 clear 错状态
    expect(
      decideSnapshotStopAction({
        ownership: 'external',
        managedPid: null,
        snapshotPid: 4242
      })
    ).toEqual({ pidToKill: 4242, clearRuntime: false })
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

/** 把关窗误杀链用纯函数串成场景，不启真进程 */
describe('关窗误杀竞态场景链（纯函数）', () => {
  it('L-delay 期间再 begin：只杀旧快照、保留新 runtime；跳过 begin 时 probe 对齐 external', () => {
    const pidAtClose = 4242
    const stopAtClose = decideStopAction({
      ownership: 'app_spawned',
      managedPid: pidAtClose
    })
    expect(stopAtClose).toEqual({
      shouldKill: true,
      pid: 4242,
      reason: 'app_spawned'
    })

    // 关窗后立刻再开：新 spawn 拿到 7777，整理结束才 stop(onlyPid=4242)
    const afterReopen = decideSnapshotStopAction({
      ownership: 'app_spawned',
      managedPid: 7777,
      snapshotPid: pidAtClose
    })
    expect(afterReopen).toEqual({ pidToKill: 4242, clearRuntime: false })

    // 前端发现端口已通跳过 begin：none → external，关窗全量 stop 不得 kill
    expect(
      decideProbeOwnershipReconcile({ ownership: 'none', serverRunning: true })
    ).toBe('external')
    expect(
      decideStopAction({ ownership: 'external', managedPid: null })
    ).toEqual({
      shouldKill: false,
      pid: null,
      reason: 'not_app_owned'
    })
  })
})
