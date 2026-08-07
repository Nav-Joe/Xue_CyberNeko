import { spawn, type ChildProcess } from 'child_process'
import { mkdirSync, openSync, closeSync, writeFileSync } from 'fs'
import { join } from 'path'

import { projectRoot, runtimeDir } from '../config/paths'
import { logError, logInfo, logWarn } from '../logging/logger'
import { createSingleFlight } from '../llama/singleFlight'
import { STT_HEALTH_POLL_MS, STT_READY_TIMEOUT_MS } from './constants'
import { decideSttProbeOwnership, decideSttStopAction, type SttOwnership } from './ownership'
import { probeSttBaseUrl, resolveVenvPython } from './probe'

export type EnsureSttResult =
  | { ok: true; baseUrl: string; reused: boolean }
  | { ok: false; detail: string }

let ownership: SttOwnership = 'none'
let managedProcess: ChildProcess | null = null
let managedPid: number | null = null
let activeBaseUrl: string | null = null

const ensureFlight = createSingleFlight<EnsureSttResult>()

function clearManaged(): void {
  managedProcess = null
  managedPid = null
  if (ownership === 'app_spawned') {
    ownership = 'none'
  }
  activeBaseUrl = null
}

async function waitUntilReady(child: ChildProcess): Promise<string> {
  const deadline = Date.now() + STT_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`stt_service 进程已退出（code=${child.exitCode}）`)
    }
    const probed = await probeSttBaseUrl()
    if (probed?.modelReady) {
      return probed.baseUrl
    }
    await new Promise((r) => setTimeout(r, STT_HEALTH_POLL_MS))
  }
  throw new Error('等待语音服务就绪超时（模型可能仍在加载）')
}

async function spawnSttService(): Promise<string> {
  const python = resolveVenvPython()
  if (!python) {
    throw new Error('未找到仓库 .venv 中的 Python，请先创建虚拟环境并安装 stt_service 依赖')
  }

  const root = projectRoot()
  const logs = join(runtimeDir(), 'logs')
  mkdirSync(logs, { recursive: true })
  const stderrLogPath = join(logs, 'stt-service.stderr.log')
  writeFileSync(stderrLogPath, `[${new Date().toISOString()}] starting stt_service\n`, 'utf-8')
  const stderrFd = openSync(stderrLogPath, 'a')

  logInfo('stt', `spawn stt_service via ${python}`)
  const child = spawn(python, ['-m', 'stt_service'], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env },
    stdio: ['ignore', 'ignore', stderrFd]
  })

  managedProcess = child
  managedPid = child.pid ?? null
  ownership = 'app_spawned'

  child.on('exit', (code) => {
    try {
      closeSync(stderrFd)
    } catch {
      /* ignore */
    }
    if (managedProcess === child) {
      clearManaged()
    }
    if (code !== 0 && code !== null) {
      logError('stt', `stt_service exited with code ${code}`, undefined, stderrLogPath)
    }
  })

  try {
    const baseUrl = await waitUntilReady(child)
    activeBaseUrl = baseUrl
    return baseUrl
  } catch (err) {
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    clearManaged()
    throw err
  }
}

async function runEnsure(): Promise<EnsureSttResult> {
  try {
    const probed = await probeSttBaseUrl()
    if (probed?.modelReady) {
      const next = decideSttProbeOwnership({ ownership, healthy: true })
      if (next) ownership = next
      activeBaseUrl = probed.baseUrl
      return { ok: true, baseUrl: probed.baseUrl, reused: true }
    }

    // 进程在但模型未就绪：本应用拉起的继续等；外部进程也短等，避免误二次 spawn
    if (probed && !probed.modelReady && ownership === 'app_spawned' && managedProcess) {
      const baseUrl = await waitUntilReady(managedProcess)
      activeBaseUrl = baseUrl
      return { ok: true, baseUrl, reused: true }
    }

    if (ownership === 'app_spawned' && managedProcess && managedProcess.exitCode === null) {
      const baseUrl = await waitUntilReady(managedProcess)
      activeBaseUrl = baseUrl
      return { ok: true, baseUrl, reused: true }
    }

    const baseUrl = await spawnSttService()
    return { ok: true, baseUrl, reused: false }
  } catch (err) {
    const detail = err instanceof Error ? err.message : '启动语音服务失败'
    logWarn('stt', 'ensureSttService failed', err)
    return { ok: false, detail }
  }
}

/** 探活或代启；并发调用共用一次 Promise，避免重复 spawn */
export function ensureSttService(): Promise<EnsureSttResult> {
  return ensureFlight(() => runEnsure())
}

/** 仅停止本应用拉起的侧车 */
export function stopManagedSttService(): { ok: true; stopped: boolean } {
  const decision = decideSttStopAction({ ownership, managedPid })
  if (!decision.shouldKill) {
    return { ok: true, stopped: false }
  }

  const child = managedProcess
  const pid = decision.pid
  try {
    if (child && !child.killed) {
      child.kill()
    } else if (pid != null && process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else if (pid != null) {
      process.kill(pid)
    }
  } catch (err) {
    logWarn('stt', 'stopManagedSttService kill failed', err)
  }

  clearManaged()
  ownership = 'none'
  logInfo('stt', `stopped managed stt_service pid=${pid}`)
  return { ok: true, stopped: true }
}

/** 测试/诊断用 */
export function getSttSessionDebug(): {
  ownership: SttOwnership
  managedPid: number | null
  activeBaseUrl: string | null
} {
  return { ownership, managedPid, activeBaseUrl }
}
