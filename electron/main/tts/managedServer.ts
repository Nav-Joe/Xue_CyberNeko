import { spawn, type ChildProcess } from 'child_process'
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from 'fs'
import { join } from 'path'

import { dataRoot, installRoot, runtimeDir } from '../config/paths'
import { logError, logInfo, logWarn } from '../logging/logger'
import { isPackagedLayout } from '../runtimeEnv/installPlan'
import { TTS_SIDECAR_IMPORT } from '../runtimeEnv/status'
import { resolveVenvPython } from '../stt/probe'
import { markSplashTtsNotComing } from '../windows/splashWindow'
import {
  ownershipAfterExit,
  planPackagedTtsLaunch,
  planTtsStop,
  type TtsOwnership
} from './launchPlan'

const TTS_HEALTH_URL = 'http://127.0.0.1:8000/health'
const IMPORT_TIMEOUT_MS = 20_000
const HEALTH_PROBE_MS = 1_500

let ownership: TtsOwnership = 'none'
let managedProcess: ChildProcess | null = null
let managedPid: number | null = null

function clearOwned(): void {
  managedProcess = null
  managedPid = null
  ownership = ownershipAfterExit(ownership)
}

async function ttsPortHasServer(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_MS)
  try {
    const response = await fetch(TTS_HEALTH_URL, { method: 'GET', signal: controller.signal })
    return response.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function killPidTree(pid: number): void {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    return
  }
  try {
    process.kill(pid)
  } catch {
    /* 进程可能已经退出 */
  }
}

/** 导入检查不能用 spawnSync，否则会堵住加载窗的 health 轮询。 */
function pythonImports(python: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(python, ['-c', TTS_SIDECAR_IMPORT], {
      cwd,
      windowsHide: true,
      stdio: 'ignore'
    })
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    timer = setTimeout(() => {
      if (child.pid != null) killPidTree(child.pid)
      finish(false)
    }, IMPORT_TIMEOUT_MS)
    child.on('exit', (code) => finish(code === 0))
    child.on('error', () => finish(false))
  })
}

function spawnServer(python: string, script: string, cwd: string, env: Record<string, string>): void {
  const logs = join(runtimeDir(), 'logs')
  mkdirSync(logs, { recursive: true })
  const stderrLogPath = join(logs, 'tts-server.stderr.log')
  writeFileSync(stderrLogPath, `[${new Date().toISOString()}] starting tts_server\n`, 'utf-8')
  const stderrFd = openSync(stderrLogPath, 'a')

  logInfo('tts', `spawn tts_server via ${python}`)
  const child = spawn(python, [script], {
    cwd,
    windowsHide: true,
    env: { ...process.env, ...env },
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
    if (managedProcess !== child) return
    clearOwned()
    if (code !== 0 && code !== null) {
      logError('tts', `tts_server exited with code ${code}`, undefined, stderrLogPath)
    }
    // 加载窗还在等 health。进程没了就不要再干等到超时。
    markSplashTtsNotComing()
  })
}

/**
 * 安装包启动时调用，不要 await。依赖没装好就放开加载窗，桌宠照常出现。
 * 开发时直接返回，避免和启动脚本各开一份。
 */
export function startPackagedTtsServer(): void {
  let install: string
  let data: string
  try {
    install = installRoot()
    data = dataRoot()
  } catch (error) {
    logWarn('tts', 'resolve roots for tts failed', error)
    return
  }
  if (!isPackagedLayout(install, data)) return

  void runStart(install, data).catch((error) => {
    logWarn('tts', 'start packaged tts failed', error)
    if (ownership !== 'app_spawned') {
      markSplashTtsNotComing()
    }
  })
}

async function runStart(install: string, data: string): Promise<void> {
  const healthUp = await ttsPortHasServer()
  if (healthUp) {
    ownership = 'external'
    return
  }

  const pythonPath = resolveVenvPython()
  const importsOk = pythonPath ? await pythonImports(pythonPath, data) : false
  const scriptExists = existsSync(join(install, 'tts_voice', 'tts_server.py'))
  const plan = planPackagedTtsLaunch({
    packaged: true,
    healthUp: false,
    pythonPath,
    importsOk,
    scriptExists,
    installRoot: install,
    dataRoot: data
  })

  if (plan.action === 'leave-splash') {
    if (healthUp) ownership = 'external'
    return
  }
  if (plan.action === 'release-splash') {
    logInfo('tts', 'local tts deps missing; pet will open without speech')
    markSplashTtsNotComing()
    return
  }
  spawnServer(plan.python, plan.script, plan.cwd, plan.env)
}

/** 退出时只结束本应用拉起的语音进程。 */
export function stopManagedTtsServer(): { ok: true; stopped: boolean } {
  const decision = planTtsStop({ ownership, pid: managedPid })
  if (!decision.shouldKill || decision.pid == null) {
    return { ok: true, stopped: false }
  }
  const pid = decision.pid
  const child = managedProcess
  try {
    killPidTree(pid)
    if (process.platform !== 'win32' && child && !child.killed) {
      child.kill()
    }
  } catch (error) {
    logWarn('tts', 'stopManagedTtsServer kill failed', error)
  }
  managedProcess = null
  managedPid = null
  ownership = 'none'
  logInfo('tts', `stopped managed tts_server pid=${pid}`)
  return { ok: true, stopped: true }
}
