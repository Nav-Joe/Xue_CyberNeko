/**
 * llama-server 会话：探测 / 启动 / 停止（下载安装见 sessionBootstrapAssets）。
 *
 * 生命周期状态机与文件职责边界见 `./CONTRACT.md`。
 *
 *   none ──(外部已有)──► external ──(stop)──► none（不 kill）
 *     └────(本应用 spawn)──► app_spawned ──(stop)──► none（kill managedPid）
 *
 * 并发 begin 经 `beginSessionSingleFlight` 复用第一次结果，只 spawn 一次。
 * 下载取消 / 点 X / reconcile → `downloadLifecycle.ts`（本文件不持有 AbortController）。
 */
import { closeSync, existsSync, mkdirSync, openSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { execSync } from 'child_process'

import { runtimeDir } from '../config/paths'
import { readChatConfigFile, toChatConfigView, writeChatConfigFile } from '../chat/chat-config'
import { logError, logInfo, logsDir } from '../logging/logger'

import {
  DEFAULT_LOCAL_MODEL_ID,
  DEFAULT_MODEL_FILENAME,
  LLAMA_READY_POLL_MS,
  LLAMA_READY_TIMEOUT_MS,
  LLAMA_SERVER_HOST,
  LLAMA_SERVER_PORT
} from './constants'
import { isDownloadAbortError } from './download'
import {
  afterDownloadAborted,
  bindLlamaManagedPidSnapshot,
  bindLlamaSessionStop,
  reconcileInterruptedLlamaDownloads
} from './downloadLifecycle'
import {
  decideProbeOwnershipReconcile,
  decideSnapshotStopAction,
  decideStopAction,
  isManagedLlamaRunning as isAppOwnedLlamaAlive,
  type LlamaOwnership
} from './managedOwnership'
import { getLocalModelStatus, resolveUsableLocalModelPath } from './modelResolve'
import { llamaPidFile } from './paths'
import { isLlamaModelsResponse, resolveLlamaListenPort } from './probe'
import {
  downloadDefaultLocalModelFile,
  emitBootstrapProgress,
  ensureLlamaServerExe,
  resolveLlamaServerExe,
  type LlamaBootstrapProgress
} from './sessionBootstrapAssets'
import { createSingleFlight } from './singleFlight'
import { awaitChatCloseFinalize } from '../memory/runtime'

export type { LocalModelStatus } from './modelResolve'
export { getLocalModelStatus } from './modelResolve'
export type { LlamaBootstrapProgress } from './sessionBootstrapAssets'
export { resolveLlamaServerExe } from './sessionBootstrapAssets'

export type LlamaBootstrapResult =
  | {
      ok: true
      autoDownloadedServer: boolean
      autoDownloadedModel: boolean
      noticeMessage?: string
      modelPath?: string
      baseUrl?: string
      hasLocalModelFile: boolean
      serverRunning: boolean
    }
  | { ok: false; detail: string }

export type BeginLlamaSessionOptions = {
  /** 是否下载默认 GGUF；false 时仅检测已有模型文件 */
  downloadModel?: boolean
}

let managedProcess: ChildProcess | null = null
let managedPid: number | null = null
/** 内存真相源：none | external | app_spawned。pid 文件仅诊断，不参与决策。 */
let ownership: LlamaOwnership = 'none'
let activeBaseUrl: string | null = null

/** 并发 begin 复用第一次结果，保证只 spawn 一次。 */
const beginSessionSingleFlight = createSingleFlight<LlamaBootstrapResult>()

function isManagedLlamaRunning(): boolean {
  return isAppOwnedLlamaAlive({ ownership, managedProcess })
}

/** 诊断用：写入 pid，便于人工排查；kill / 存活判定不得依赖此文件。 */
function persistPidDiagnostic(pid: number): void {
  try {
    mkdirSync(runtimeDir(), { recursive: true })
    writeFileSync(llamaPidFile(), `${pid}\n`, 'utf-8')
  } catch {
    // 诊断失败不影响生命周期
  }
}

function clearPidDiagnostic(): void {
  try {
    if (existsSync(llamaPidFile())) rmSync(llamaPidFile(), { force: true })
  } catch {
    // ignore
  }
}

function clearManagedRuntime(): void {
  managedProcess = null
  managedPid = null
  ownership = 'none'
  activeBaseUrl = null
  clearPidDiagnostic()
}

function emitProgress(
  send: ((payload: LlamaBootstrapProgress) => void) | undefined,
  phase: string,
  message: string,
  progress?: { done: number; total: number }
): void {
  emitBootstrapProgress(send, phase, message, progress)
}

function modelIdFromFilename(fileName: string): string {
  if (fileName === DEFAULT_MODEL_FILENAME) return DEFAULT_LOCAL_MODEL_ID
  return fileName.replace(/\.gguf$/i, '')
}

async function waitForLlamaReady(baseUrl: string, child?: ChildProcess | null): Promise<void> {
  const deadline = Date.now() + LLAMA_READY_TIMEOUT_MS
  let lastLogAt = 0
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `llama-server 进程已退出 (code=${child.exitCode})，请查看 ${join(logsDir(), 'llama-server.stderr.log')}`
      )
    }

    try {
      const response = await fetch(`${baseUrl}/v1/models`)
      if (response.ok) {
        const json = await response.json()
        if (isLlamaModelsResponse(json)) return
      }
    } catch {
      // retry
    }

    if (Date.now() - lastLogAt > 10_000) {
      logInfo('llama', `等待 llama-server 就绪: ${baseUrl}`)
      lastLogAt = Date.now()
    }
    await new Promise((r) => setTimeout(r, LLAMA_READY_POLL_MS))
  }
  throw new Error(
    `llama-server 启动超时 (${baseUrl})。若 8080 被 go-cqhttp 等程序占用，请关闭冲突程序或查看 ${join(logsDir(), 'llama-server.stderr.log')}`
  )
}

async function startManagedLlamaServer(
  exePath: string,
  modelPath: string,
  send?: (payload: LlamaBootstrapProgress) => void
): Promise<string> {
  const configuredBaseUrl = activeBaseUrl ?? `http://${LLAMA_SERVER_HOST}:${LLAMA_SERVER_PORT}`
  const preferredPort = Number(new URL(configuredBaseUrl).port || LLAMA_SERVER_PORT)
  const { port, baseUrl, alreadyRunning } = await resolveLlamaListenPort(LLAMA_SERVER_HOST, preferredPort)
  activeBaseUrl = baseUrl

  if (isManagedLlamaRunning()) {
    await waitForLlamaReady(baseUrl, managedProcess)
    return baseUrl
  }

  if (alreadyRunning) {
    ownership = 'external'
    managedProcess = null
    managedPid = null
    clearPidDiagnostic()
    emitProgress(send, 'ready', `检测到本地 llama-server 已在运行 (${baseUrl})`)
    return baseUrl
  }

  emitProgress(send, 'start_server', `正在启动 llama-server (${baseUrl})…`)
  logInfo('llama', `启动 llama-server: ${exePath} port=${port}`)
  mkdirSync(logsDir(), { recursive: true })
  const stderrLogPath = join(logsDir(), 'llama-server.stderr.log')
  writeFileSync(stderrLogPath, `[${new Date().toISOString()}] starting llama-server on ${baseUrl}\n`, 'utf-8')
  const stderrFd = openSync(stderrLogPath, 'a')

  const args = ['-m', modelPath, '--host', LLAMA_SERVER_HOST, '--port', String(port), '-c', '4096']
  const child = spawn(exePath, args, {
    cwd: dirname(exePath),
    windowsHide: true,
    stdio: ['ignore', 'ignore', stderrFd]
  })
  managedProcess = child
  managedPid = child.pid ?? null
  ownership = 'app_spawned'
  if (managedPid) persistPidDiagnostic(managedPid)

  child.on('exit', (code) => {
    try {
      closeSync(stderrFd)
    } catch {
      // ignore
    }
    if (managedProcess === child) {
      managedProcess = null
      managedPid = null
      ownership = 'none'
      clearPidDiagnostic()
    }
    if (code !== 0 && code !== null) {
      logError('llama', `llama-server exited with code ${code}`, undefined, stderrLogPath)
    }
  })

  await waitForLlamaReady(baseUrl, child)
  emitProgress(send, 'ready', `llama-server 已就绪 (${baseUrl})`)
  return baseUrl
}

function syncChatConfigForLocalModel(modelPath: string, baseUrl: string): void {
  const fileName = modelPath.split(/[/\\]/).pop() ?? DEFAULT_MODEL_FILENAME
  syncChatConfigForLocalServer(baseUrl, modelIdFromFilename(fileName))
}

function syncChatConfigForLocalServer(baseUrl: string, modelId?: string): void {
  const current = readChatConfigFile()
  writeChatConfigFile({
    ...toChatConfigView(current),
    local: {
      ...current.local,
      selectedBaseUrl: baseUrl,
      selectedModelId: modelId ?? current.local.selectedModelId
    }
  })
}

async function tryDetectExternalLlamaServer(
  send?: (payload: LlamaBootstrapProgress) => void
): Promise<string | null> {
  emitProgress(send, 'check', '正在检测已运行的 llama-server…')
  const configuredBaseUrl = activeBaseUrl ?? `http://${LLAMA_SERVER_HOST}:${LLAMA_SERVER_PORT}`
  const preferredPort = Number(new URL(configuredBaseUrl).port || LLAMA_SERVER_PORT)
  try {
    const { baseUrl, alreadyRunning } = await resolveLlamaListenPort(LLAMA_SERVER_HOST, preferredPort)
    if (alreadyRunning) {
      activeBaseUrl = baseUrl
      syncChatConfigForLocalServer(baseUrl)
      return baseUrl
    }
  } catch {
    // ignore
  }
  return null
}

export async function probeLocalLlamaServer(): Promise<{ serverRunning: boolean; baseUrl?: string }> {
  const currentConfig = readChatConfigFile()
  const configuredBaseUrl =
    currentConfig.local?.selectedBaseUrl?.trim() || `http://${LLAMA_SERVER_HOST}:${LLAMA_SERVER_PORT}`
  const preferredPort = Number(new URL(configuredBaseUrl).port || LLAMA_SERVER_PORT)
  try {
    const { baseUrl, alreadyRunning } = await resolveLlamaListenPort(LLAMA_SERVER_HOST, preferredPort)
    applyProbeOwnershipReconcile(alreadyRunning)
    return { serverRunning: alreadyRunning, baseUrl: alreadyRunning ? baseUrl : undefined }
  } catch {
    applyProbeOwnershipReconcile(false)
    return { serverRunning: false }
  }
}

/** 探测后对齐内存所有权：不杀进程、不 spawn（见 decideProbeOwnershipReconcile）。 */
function applyProbeOwnershipReconcile(serverRunning: boolean): void {
  const next = decideProbeOwnershipReconcile({ ownership, serverRunning })
  if (next === null) return
  if (next === 'external') {
    ownership = 'external'
    managedProcess = null
    managedPid = null
    clearPidDiagnostic()
    logInfo('llama', 'probe: port up, ownership none → external')
    return
  }
  ownership = 'none'
  clearPidDiagnostic()
  logInfo('llama', 'probe: port down, ownership external → none')
}

export async function downloadDefaultLocalModel(
  send?: (payload: LlamaBootstrapProgress) => void
): Promise<
  | { ok: true; modelPath: string; downloaded: boolean; baseUrl?: string; serverStarted: boolean }
  | { ok: false; detail: string; cancelled?: boolean }
> {
  try {
    await awaitChatCloseFinalize()
    await reconcileInterruptedLlamaDownloads()
    const model = await downloadDefaultLocalModelFile(send)
    const exePath = resolveLlamaServerExe()
    if (!exePath) {
      return {
        ok: true,
        modelPath: model.modelPath,
        downloaded: model.downloaded,
        serverStarted: false
      }
    }

    emitProgress(send, 'start_server', '正在启动 llama-server…')
    const baseUrl = await startManagedLlamaServer(exePath, model.modelPath, send)
    syncChatConfigForLocalModel(model.modelPath, baseUrl)
    return {
      ok: true,
      modelPath: model.modelPath,
      downloaded: model.downloaded,
      baseUrl,
      serverStarted: true
    }
  } catch (err) {
    if (isDownloadAbortError(err)) {
      await afterDownloadAborted()
      return { ok: false, detail: '已取消下载', cancelled: true }
    }
    logError('llama', 'downloadDefaultLocalModel failed', err)
    return {
      ok: false,
      detail: err instanceof Error ? err.message : '本地大模型下载失败'
    }
  }
}

export async function beginLlamaChatSession(
  send?: (payload: LlamaBootstrapProgress) => void,
  options: BeginLlamaSessionOptions = {}
): Promise<LlamaBootstrapResult> {
  return beginSessionSingleFlight(() => runBeginLlamaChatSession(send, options))
}

async function runBeginLlamaChatSession(
  send?: (payload: LlamaBootstrapProgress) => void,
  options: BeginLlamaSessionOptions = {}
): Promise<LlamaBootstrapResult> {
  try {
    // 关窗延迟整理未结束时先等：避免总结结束 stop 误杀本次新 spawn（见 app-2026-07-28）
    await awaitChatCloseFinalize()
    await reconcileInterruptedLlamaDownloads()

    const currentConfig = readChatConfigFile()
    if (!isManagedLlamaRunning()) {
      activeBaseUrl = currentConfig.local?.selectedBaseUrl?.trim() || null
    }
    emitProgress(send, 'check', '正在检查本地 llama-server…')
    const server = await ensureLlamaServerExe(send)

    let modelPath = resolveUsableLocalModelPath()
    let autoDownloadedModel = false
    if (!modelPath && options.downloadModel) {
      const model = await downloadDefaultLocalModelFile(send)
      modelPath = model.modelPath
      autoDownloadedModel = model.downloaded
    }

    let baseUrl: string | undefined
    let serverRunning = false

    if (modelPath) {
      baseUrl = await startManagedLlamaServer(server.exePath, modelPath, send)
      syncChatConfigForLocalModel(modelPath, baseUrl)
      serverRunning = true
    } else {
      const external = await tryDetectExternalLlamaServer(send)
      if (external) {
        ownership = 'external'
        managedProcess = null
        managedPid = null
        clearPidDiagnostic()
        baseUrl = external
        serverRunning = true
      }
    }

    const autoDownloadedServer = server.downloaded
    let noticeMessage: string | undefined
    if (autoDownloadedServer) {
      noticeMessage = '本项目无 llama-server，已为您自动下载'
      if (autoDownloadedModel) {
        noticeMessage += `，并已下载默认模型 ${DEFAULT_LOCAL_MODEL_ID}`
      }
    } else if (autoDownloadedModel) {
      noticeMessage = `已下载默认本地模型 ${DEFAULT_LOCAL_MODEL_ID}`
    }

    return {
      ok: true,
      autoDownloadedServer,
      autoDownloadedModel,
      noticeMessage,
      modelPath: modelPath ?? undefined,
      baseUrl,
      hasLocalModelFile: Boolean(modelPath),
      serverRunning
    }
  } catch (err) {
    if (isDownloadAbortError(err)) {
      await afterDownloadAborted()
      return { ok: false, detail: '已取消下载' }
    }
    logError('llama', 'beginLlamaChatSession failed', err)
    return {
      ok: false,
      detail: err instanceof Error ? err.message : 'llama-server 准备失败'
    }
  }
}

export function snapshotAppSpawnedManagedPid(): number | null {
  if (ownership !== 'app_spawned') return null
  return managedPid
}

export async function stopManagedLlamaServer(options?: {
  onlyPid?: number | null
}): Promise<{ ok: boolean }> {
  if (options && 'onlyPid' in options) {
    const decision = decideSnapshotStopAction({
      ownership,
      managedPid,
      snapshotPid: options.onlyPid ?? null
    })
    if (decision.clearRuntime) {
      clearManagedRuntime()
    } else if (decision.pidToKill != null) {
      logInfo(
        'llama',
        `stopManagedLlamaServer(onlyPid=${decision.pidToKill}): skip clearRuntime (managedPid=${managedPid} ownership=${ownership})`
      )
    }
    if (decision.pidToKill == null) {
      return { ok: true }
    }
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${decision.pidToKill} /T /F`, { stdio: 'ignore' })
      } else {
        process.kill(decision.pidToKill)
      }
    } catch {
      // 进程可能已退出
    }
    return { ok: true }
  }

  const decision = decideStopAction({ ownership, managedPid })
  const pidToKill = decision.shouldKill ? decision.pid : null

  clearManagedRuntime()

  if (!pidToKill) {
    return { ok: true }
  }

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pidToKill} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(pidToKill)
    }
  } catch {
    // 进程可能已退出
  }
  return { ok: true }
}

// 注入 stop / pid 快照，供 downloadLifecycle 取消 / 关窗调用（避免 lifecycle ↔ session 循环 import）
bindLlamaSessionStop(stopManagedLlamaServer)
bindLlamaManagedPidSnapshot(snapshotAppSpawnedManagedPid)

// 兼容再导出：IPC / 前端仍可从 session 或 lifecycle 导入
export {
  cancelLlamaDownload,
  onChatWindowClosed,
  reconcileInterruptedLlamaDownloads
} from './downloadLifecycle'
