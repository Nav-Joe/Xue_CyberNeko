import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'fs'
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
  LLAMA_SERVER_PORT,
  buildDefaultModelMirrorUrls,
  buildLlamaWinZipMirrorUrls
} from './constants'
import {
  downloadFileWithMirrors,
  extractZipWindows,
  flattenLlamaBin,
  listGgufModelFiles,
  type DownloadProgress
} from './download'
import { llamaBinDir, llamaInstallWorkDir, llamaModelsDir, llamaPidFile, llamaServerExeCandidates } from './paths'
import { isLlamaModelsResponse, probeLlamaEndpointState, resolveLlamaListenPort } from './probe'

export type LlamaBootstrapProgress = {
  phase: string
  message: string
  progress?: { done: number; total: number }
}

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

export type LocalModelStatus = {
  hasLocalModelFile: boolean
  modelPath: string | null
  modelFilename: string | null
  defaultModelId: string
}

let managedProcess: ChildProcess | null = null
let managedPid: number | null = null
let sessionStartedByApp = false
let activeBaseUrl: string | null = null

function emitProgress(
  send: ((payload: LlamaBootstrapProgress) => void) | undefined,
  phase: string,
  message: string,
  progress?: { done: number; total: number }
): void {
  send?.({ phase, message, progress })
}

function createDownloadProgressHandler(
  send: ((payload: LlamaBootstrapProgress) => void) | undefined,
  phase: string,
  title: string
): (progress: DownloadProgress) => void {
  let lastEmitAt = 0
  return (progress: DownloadProgress) => {
    const { done, total } = progress
    const now = Date.now()
    const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
    if (now - lastEmitAt < 120 && percent < 100) return
    lastEmitAt = now
    const message =
      total > 0
        ? `${title} ${percent}%`
        : done > 0
          ? `${title}（已下载 ${Math.round(done / 1024 / 1024)} MB）`
          : title
    emitProgress(send, phase, message, { done, total })
  }
}

export function resolveLlamaServerExe(): string | null {
  for (const candidate of llamaServerExeCandidates()) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function resolveModelPath(): string | null {
  const models = listGgufModelFiles(llamaModelsDir())
  if (models.length === 0) return null
  const preferred = models.includes(DEFAULT_MODEL_FILENAME) ? DEFAULT_MODEL_FILENAME : models[0]
  return join(llamaModelsDir(), preferred)
}

export function getLocalModelStatus(): LocalModelStatus {
  const modelPath = resolveModelPath()
  const modelFilename = modelPath ? modelPath.split(/[/\\]/).pop() ?? null : null
  return {
    hasLocalModelFile: Boolean(modelPath),
    modelPath,
    modelFilename,
    defaultModelId: DEFAULT_LOCAL_MODEL_ID
  }
}

function modelIdFromFilename(fileName: string): string {
  if (fileName === DEFAULT_MODEL_FILENAME) return DEFAULT_LOCAL_MODEL_ID
  return fileName.replace(/\.gguf$/i, '')
}

async function waitForLlamaReady(
  baseUrl: string,
  child?: ChildProcess | null
): Promise<void> {
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

async function ensureLlamaServerExe(
  send?: (payload: LlamaBootstrapProgress) => void
): Promise<{ exePath: string; downloaded: boolean }> {
  const existing = resolveLlamaServerExe()
  if (existing) {
    return { exePath: existing, downloaded: false }
  }

  emitProgress(send, 'download_server', '正在下载 llama-server…')
  const binDir = llamaBinDir()
  const workDir = llamaInstallWorkDir()
  const zipPath = join(workDir, 'llama-server-download.zip')
  const extractDir = join(workDir, 'extract')
  mkdirSync(workDir, { recursive: true })

  try {
    const serverResult = await downloadFileWithMirrors(
      buildLlamaWinZipMirrorUrls(),
      zipPath,
      createDownloadProgressHandler(send, 'download_server', '正在下载 llama-server…'),
      (source, index, total) => {
        const hint = index === 0 ? '国内镜像' : `备用源 ${index + 1}/${total}`
        logInfo('llama', `llama-server 下载: ${hint} (${source})`)
        emitProgress(send, 'download_server', `正在从 ${source} 下载 llama-server…`)
      }
    )
    logInfo('llama', `llama-server 下载完成: ${serverResult.source}`)

    emitProgress(send, 'install_server', '正在解压 llama-server…')
    extractZipWindows(zipPath, extractDir)
    const exePath = flattenLlamaBin(extractDir, binDir)
    return { exePath, downloaded: true }
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true })
    } catch {
      // 临时目录可能被杀毒/索引短暂占用，忽略清理失败
    }
  }
}

async function downloadDefaultLocalModelFile(
  send?: (payload: LlamaBootstrapProgress) => void
): Promise<{ modelPath: string; downloaded: boolean }> {
  mkdirSync(llamaModelsDir(), { recursive: true })
  const existing = resolveModelPath()
  if (existing) {
    return { modelPath: existing, downloaded: false }
  }

  emitProgress(send, 'download_model', `正在下载默认模型 ${DEFAULT_LOCAL_MODEL_ID}…`)
  const dest = join(llamaModelsDir(), DEFAULT_MODEL_FILENAME)
  const modelResult = await downloadFileWithMirrors(
    buildDefaultModelMirrorUrls(),
    dest,
    createDownloadProgressHandler(send, 'download_model', `正在下载 ${DEFAULT_LOCAL_MODEL_ID}…`),
    (source, index, total) => {
      const hint = index === 0 ? '国内镜像' : `备用源 ${index + 1}/${total}`
      logInfo('llama', `模型下载: ${hint} (${source})`)
      emitProgress(send, 'download_model', `正在从 ${source} 下载 ${DEFAULT_LOCAL_MODEL_ID}…`)
    }
  )
  logInfo('llama', `模型下载完成: ${modelResult.source}`)
  return { modelPath: dest, downloaded: true }
}

function isManagedLlamaRunning(): boolean {
  if (managedProcess && !managedProcess.killed) return true
  const pidFile = llamaPidFile()
  if (!existsSync(pidFile)) return false
  try {
    const pid = Number(readFileSync(pidFile, 'utf-8').trim())
    if (!Number.isFinite(pid) || pid <= 0) return false
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function persistPid(pid: number): void {
  mkdirSync(runtimeDir(), { recursive: true })
  writeFileSync(llamaPidFile(), `${pid}\n`, 'utf-8')
}

function clearPid(): void {
  try {
    if (existsSync(llamaPidFile())) rmSync(llamaPidFile(), { force: true })
  } catch {
    // ignore
  }
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
    sessionStartedByApp = true
    await waitForLlamaReady(baseUrl, managedProcess)
    return baseUrl
  }

  if (alreadyRunning) {
    sessionStartedByApp = false
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
  sessionStartedByApp = true
  if (managedPid) persistPid(managedPid)

  child.on('exit', (code) => {
    try {
      closeSync(stderrFd)
    } catch {
      // ignore
    }
    if (managedProcess === child) {
      managedProcess = null
      managedPid = null
      clearPid()
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
    return { serverRunning: alreadyRunning, baseUrl: alreadyRunning ? baseUrl : undefined }
  } catch {
    return { serverRunning: false }
  }
}

export async function downloadDefaultLocalModel(
  send?: (payload: LlamaBootstrapProgress) => void
): Promise<
  | { ok: true; modelPath: string; downloaded: boolean; baseUrl?: string; serverStarted: boolean }
  | { ok: false; detail: string }
> {
  try {
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
  try {
    sessionStartedByApp = false
    const currentConfig = readChatConfigFile()
    activeBaseUrl = currentConfig.local?.selectedBaseUrl?.trim() || null
    emitProgress(send, 'check', '正在检查本地 llama-server…')
    const server = await ensureLlamaServerExe(send)

    let modelPath = resolveModelPath()
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
    logError('llama', 'beginLlamaChatSession failed', err)
    return {
      ok: false,
      detail: err instanceof Error ? err.message : 'llama-server 准备失败'
    }
  }
}

export async function stopManagedLlamaServer(): Promise<{ ok: boolean }> {
  const pidFromFile = (() => {
    try {
      if (!existsSync(llamaPidFile())) return null
      const parsed = Number(readFileSync(llamaPidFile(), 'utf-8').trim())
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    } catch {
      return null
    }
  })()

  const pid = managedPid ?? pidFromFile
  const hasLiveManagedProcess = Boolean(managedProcess && !managedProcess.killed)
  const hasTrackedPid = pid !== null && (hasLiveManagedProcess || isManagedLlamaRunning())
  const shouldKill = sessionStartedByApp || hasLiveManagedProcess || hasTrackedPid

  managedProcess = null
  managedPid = null
  sessionStartedByApp = false
  activeBaseUrl = null
  clearPid()

  if (!shouldKill || !pid) {
    return { ok: true }
  }

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(pid)
    }
  } catch {
    // 进程可能已退出
  }
  return { ok: true }
}
