import { join } from 'path'

import { runtimeInstallEnv } from '../runtimeEnv/installPlan'

export type TtsOwnership = 'none' | 'external' | 'app_spawned'

export type TtsLaunchPlan =
  | { action: 'leave-splash' }
  | { action: 'release-splash' }
  | {
      action: 'spawn'
      python: string
      script: string
      cwd: string
      env: Record<string, string>
    }

export type TtsStopPlan = {
  shouldKill: boolean
  pid: number | null
}

/**
 * 只在两个根不同时拉起。端口上已经有服务就留给加载窗自己等，退出时也不关。
 * 开发时两个根相同，启动脚本会另开一份，这里必须什么都不做。
 */
export function planPackagedTtsLaunch(input: {
  packaged: boolean
  healthUp: boolean
  pythonPath: string | null
  importsOk: boolean
  scriptExists: boolean
  installRoot: string
  dataRoot: string
}): TtsLaunchPlan {
  if (!input.packaged || input.healthUp) {
    return { action: 'leave-splash' }
  }
  if (!input.pythonPath || !input.importsOk || !input.scriptExists) {
    return { action: 'release-splash' }
  }
  return {
    action: 'spawn',
    python: input.pythonPath,
    script: join(input.installRoot, 'tts_voice', 'tts_server.py'),
    cwd: input.installRoot,
    env: runtimeInstallEnv(input.installRoot, input.dataRoot)
  }
}

/** 只结束本应用拉起的那一棵进程。别人开在 8000 上的不杀。 */
export function planTtsStop(state: { ownership: TtsOwnership; pid: number | null }): TtsStopPlan {
  if (state.ownership !== 'app_spawned' || state.pid == null) {
    return { shouldKill: false, pid: null }
  }
  return { shouldKill: true, pid: state.pid }
}

/** 子进程结束后清掉所有权，避免退出时再对一个已经没了的 pid 做一次 taskkill。 */
export function ownershipAfterExit(ownership: TtsOwnership): TtsOwnership {
  if (ownership === 'app_spawned') return 'none'
  return ownership
}
