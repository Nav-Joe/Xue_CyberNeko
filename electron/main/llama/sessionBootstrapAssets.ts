/**
 * llama 启动资产：安装/下载编排。
 *
 * 只负责：找/下 llama-server zip、下默认 GGUF、进度桥。
 * 禁止：spawn、ownership、begin 单飞、写 chat-config（仍在 session.ts）。
 * 边界见 `./CONTRACT.md` §文件职责。
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

import { logInfo } from '../logging/logger'

import {
  DEFAULT_LOCAL_MODEL_ID,
  buildDefaultModelMirrorUrls,
  buildLlamaWinZipMirrorUrls
} from './constants'
import {
  downloadFileWithMirrors,
  extractZipWindows,
  flattenLlamaBin,
  type DownloadProgress
} from './download'
import {
  beginDownloadAbortScope,
  defaultLocalModelDest,
  endDownloadAbortScope
} from './downloadLifecycle'
import { resolveUsableLocalModelPath } from './modelResolve'
import { llamaBinDir, llamaInstallWorkDir, llamaModelsDir, llamaServerExeCandidates } from './paths'

export type LlamaBootstrapProgress = {
  phase: string
  message: string
  progress?: { done: number; total: number }
}

export type LlamaBootstrapSend = ((payload: LlamaBootstrapProgress) => void) | undefined

export function emitBootstrapProgress(
  send: LlamaBootstrapSend,
  phase: string,
  message: string,
  progress?: { done: number; total: number }
): void {
  send?.({ phase, message, progress })
}

function createDownloadProgressHandler(
  send: LlamaBootstrapSend,
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
    emitBootstrapProgress(send, phase, message, { done, total })
  }
}

export function resolveLlamaServerExe(): string | null {
  for (const candidate of llamaServerExeCandidates()) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export async function ensureLlamaServerExe(
  send?: LlamaBootstrapSend
): Promise<{ exePath: string; downloaded: boolean }> {
  const existing = resolveLlamaServerExe()
  if (existing) {
    return { exePath: existing, downloaded: false }
  }

  emitBootstrapProgress(send, 'download_server', '正在下载 llama-server…')
  const binDir = llamaBinDir()
  const workDir = llamaInstallWorkDir()
  const zipPath = join(workDir, 'llama-server-download.zip')
  const extractDir = join(workDir, 'extract')
  mkdirSync(workDir, { recursive: true })
  const signal = beginDownloadAbortScope()

  try {
    const serverResult = await downloadFileWithMirrors(
      buildLlamaWinZipMirrorUrls(),
      zipPath,
      createDownloadProgressHandler(send, 'download_server', '正在下载 llama-server…'),
      (source, index, total) => {
        const hint = index === 0 ? '国内镜像' : `备用源 ${index + 1}/${total}`
        logInfo('llama', `llama-server 下载: ${hint} (${source})`)
        emitBootstrapProgress(send, 'download_server', `正在从 ${source} 下载 llama-server…`)
      },
      signal
    )
    logInfo('llama', `llama-server 下载完成: ${serverResult.source}`)

    emitBootstrapProgress(send, 'install_server', '正在解压 llama-server…')
    extractZipWindows(zipPath, extractDir)
    const exePath = flattenLlamaBin(extractDir, binDir)
    return { exePath, downloaded: true }
  } finally {
    endDownloadAbortScope(signal)
    try {
      rmSync(workDir, { recursive: true, force: true })
    } catch {
      // 临时目录可能被杀毒/索引短暂占用，忽略清理失败
    }
  }
}

export async function downloadDefaultLocalModelFile(
  send?: LlamaBootstrapSend
): Promise<{ modelPath: string; downloaded: boolean }> {
  mkdirSync(llamaModelsDir(), { recursive: true })
  const existing = resolveUsableLocalModelPath()
  if (existing) {
    return { modelPath: existing, downloaded: false }
  }

  emitBootstrapProgress(send, 'download_model', `正在下载默认模型 ${DEFAULT_LOCAL_MODEL_ID}…`)
  const dest = defaultLocalModelDest()
  const signal = beginDownloadAbortScope()
  try {
    const modelResult = await downloadFileWithMirrors(
      buildDefaultModelMirrorUrls(),
      dest,
      createDownloadProgressHandler(send, 'download_model', `正在下载 ${DEFAULT_LOCAL_MODEL_ID}…`),
      (source, index, total) => {
        const hint = index === 0 ? '国内镜像' : `备用源 ${index + 1}/${total}`
        logInfo('llama', `模型下载: ${hint} (${source})`)
        emitBootstrapProgress(send, 'download_model', `正在从 ${source} 下载 ${DEFAULT_LOCAL_MODEL_ID}…`)
      },
      signal
    )
    logInfo('llama', `模型下载完成: ${modelResult.source}`)
    return { modelPath: dest, downloaded: true }
  } finally {
    endDownloadAbortScope(signal)
  }
}
