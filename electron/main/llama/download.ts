import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { basename, dirname, join } from 'path'
import { execFileSync } from 'child_process'
import { get as httpsGet, request as httpsRequest, type ClientRequest } from 'https'
import type { IncomingMessage } from 'http'

export type DownloadProgress = { done: number; total: number; label: string }

export class DownloadAbortError extends Error {
  readonly code = 'DOWNLOAD_ABORTED' as const

  constructor(message = '下载已取消') {
    super(message)
    this.name = 'DownloadAbortError'
  }
}

export function isDownloadAbortError(err: unknown): boolean {
  return err instanceof DownloadAbortError || (err instanceof Error && err.name === 'DownloadAbortError')
}

/** 正式文件旁的半成品路径；中断退出时不会被当成完整 GGUF。 */
export function downloadPartialPath(destPath: string): string {
  return `${destPath}.partial`
}

function expectedSizeSidecar(destPath: string): string {
  return `${destPath}.expected`
}

export function removePartialFile(destPath: string): void {
  if (!existsSync(destPath)) return
  try {
    unlinkSync(destPath)
  } catch {
    // ignore
  }
}

export function writeExpectedDownloadSize(destPath: string, total: number): void {
  if (!(total > 0)) return
  try {
    writeFileSync(expectedSizeSidecar(destPath), `${total}\n`, 'utf-8')
  } catch {
    // ignore
  }
}

export function readExpectedDownloadSize(destPath: string): number | null {
  const side = expectedSizeSidecar(destPath)
  if (!existsSync(side)) return null
  try {
    const n = Number(readFileSync(side, 'utf-8').trim())
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function clearExpectedDownloadSize(destPath: string): void {
  removePartialFile(expectedSizeSidecar(destPath))
}

/** 删除目标文件及其 .partial / .expected */
export function removeDownloadArtifacts(destPath: string): void {
  removePartialFile(destPath)
  removePartialFile(downloadPartialPath(destPath))
  clearExpectedDownloadSize(destPath)
}

/** 若存在体积约定且实际文件明显偏小，视为未下完。 */
export function isIncompleteDownloadFile(destPath: string, sizeBytes: number): boolean {
  const expected = readExpectedDownloadSize(destPath)
  if (expected !== null) {
    return sizeBytes < expected * 0.98
  }
  return false
}

function followUrl(base: string, location: string): string {
  try {
    return new URL(location, base).toString()
  } catch {
    return location
  }
}

function probeHeadContentLength(url: string, redirectLeft = 5): Promise<number> {
  return new Promise((resolve) => {
    const req = httpsRequest(url, { method: 'HEAD' }, (response) => {
      response.resume()
      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400 && response.headers.location && redirectLeft > 0) {
        probeHeadContentLength(followUrl(url, response.headers.location), redirectLeft - 1).then(resolve)
        return
      }
      resolve(Number(response.headers['content-length'] ?? 0))
    })
    req.on('error', () => resolve(0))
    req.end()
  })
}

function probeRangeContentLength(url: string, redirectLeft = 5): Promise<number> {
  return new Promise((resolve) => {
    const req = httpsRequest(url, { method: 'GET', headers: { Range: 'bytes=0-0' } }, (response) => {
      response.resume()
      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400 && response.headers.location && redirectLeft > 0) {
        probeRangeContentLength(followUrl(url, response.headers.location), redirectLeft - 1).then(resolve)
        return
      }
      const range = response.headers['content-range']
      if (typeof range === 'string') {
        const match = /\/(\d+)\s*$/u.exec(range)
        if (match) {
          resolve(Number(match[1]))
          return
        }
      }
      resolve(Number(response.headers['content-length'] ?? 0))
    })
    req.on('error', () => resolve(0))
    req.end()
  })
}

export async function probeDownloadTotal(url: string): Promise<number> {
  const headTotal = await probeHeadContentLength(url)
  if (headTotal > 0) return headTotal
  return probeRangeContentLength(url)
}

export type DownloadFileOptions = {
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
}

/**
 * 下载到 destPath.partial，成功后再 rename 为 destPath。
 * 中途取消 / 失败会删掉半成品，避免残缺 .gguf 被当成可用模型。
 */
export async function downloadFile(
  url: string,
  destPath: string,
  onProgressOrOptions?: ((progress: DownloadProgress) => void) | DownloadFileOptions,
  maybeSignal?: AbortSignal
): Promise<void> {
  const options: DownloadFileOptions =
    typeof onProgressOrOptions === 'function'
      ? { onProgress: onProgressOrOptions, signal: maybeSignal }
      : onProgressOrOptions ?? {}

  const { onProgress, signal } = options
  throwIfAborted(signal)

  mkdirSync(dirname(destPath), { recursive: true })
  const label = basename(destPath)
  const partialPath = downloadPartialPath(destPath)
  removeDownloadArtifacts(destPath)

  const knownTotal = await probeDownloadTotal(url)
  throwIfAborted(signal)
  writeExpectedDownloadSize(destPath, knownTotal)
  onProgress?.({ done: 0, total: knownTotal, label })
  await fetchToFile(url, partialPath, onProgress, 5, knownTotal, label, signal)
  throwIfAborted(signal)

  const size = statSync(partialPath).size
  renameSync(partialPath, destPath)
  clearExpectedDownloadSize(destPath)
  onProgress?.({ done: size, total: knownTotal > 0 ? knownTotal : size, label })
}

function downloadSourceLabel(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export type DownloadMirrorResult = { url: string; source: string }

export async function downloadFileWithMirrors(
  urls: string[],
  destPath: string,
  onProgress?: (progress: DownloadProgress) => void,
  onMirrorAttempt?: (source: string, index: number, total: number) => void,
  signal?: AbortSignal
): Promise<DownloadMirrorResult> {
  const candidates = urls.filter(Boolean)
  if (candidates.length === 0) {
    throw new Error('未配置下载地址')
  }

  let lastError: Error | null = null
  for (let index = 0; index < candidates.length; index += 1) {
    throwIfAborted(signal)
    const url = candidates[index]
    const source = downloadSourceLabel(url)
    onMirrorAttempt?.(source, index, candidates.length)
    try {
      removeDownloadArtifacts(destPath)
      await downloadFile(url, destPath, { onProgress, signal })
      return { url, source }
    } catch (err) {
      if (isDownloadAbortError(err)) {
        removeDownloadArtifacts(destPath)
        throw err
      }
      lastError = err instanceof Error ? err : new Error(String(err))
      removeDownloadArtifacts(destPath)
    }
  }

  throw lastError ?? new Error('所有下载源均失败')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DownloadAbortError()
  }
}

function destroySocket(req: ClientRequest, response?: IncomingMessage): void {
  try {
    req.destroy()
  } catch {
    // ignore
  }
  try {
    response?.destroy()
  } catch {
    // ignore
  }
}

async function fetchToFile(
  url: string,
  destPath: string,
  onProgress: ((progress: DownloadProgress) => void) | undefined,
  redirectLeft: number,
  knownTotal: number,
  label: string,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal)

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let responseRef: IncomingMessage | undefined
    let file: ReturnType<typeof createWriteStream> | undefined

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      if (err) {
        try {
          file?.destroy()
        } catch {
          // ignore
        }
        removePartialFile(destPath)
        reject(err)
        return
      }
      resolve()
    }

    const onAbort = () => {
      destroySocket(req, responseRef)
      finish(new DownloadAbortError())
    }

    const req = httpsGet(url, (response) => {
      responseRef = response
      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400 && response.headers.location && redirectLeft > 0) {
        response.resume()
        signal?.removeEventListener('abort', onAbort)
        fetchToFile(
          followUrl(url, response.headers.location),
          destPath,
          onProgress,
          redirectLeft - 1,
          knownTotal,
          label,
          signal
        )
          .then(() => finish())
          .catch((err) => finish(err instanceof Error ? err : new Error(String(err))))
        return
      }
      if (status !== 200 && status !== 206) {
        response.resume()
        finish(new Error(`下载失败 HTTP ${status}: ${url}`))
        return
      }

      const headerTotal = Number(response.headers['content-length'] ?? 0)
      const total = headerTotal > 0 ? headerTotal : knownTotal
      let done = 0
      let lastEmitAt = 0
      file = createWriteStream(destPath)
      response.on('data', (chunk: Buffer) => {
        if (signal?.aborted) return
        done += chunk.length
        const now = Date.now()
        if (now - lastEmitAt < 100 && done < total) return
        lastEmitAt = now
        onProgress?.({ done, total, label })
      })
      response.pipe(file)
      file.on('finish', () => {
        file?.close((closeErr) => {
          if (closeErr) {
            finish(closeErr)
            return
          }
          if (signal?.aborted) {
            finish(new DownloadAbortError())
            return
          }
          finish()
        })
      })
      file.on('error', (err) => finish(err))
      response.on('error', (err) => finish(err))
    })

    req.on('error', (err) => {
      if (signal?.aborted) {
        finish(new DownloadAbortError())
        return
      }
      finish(err)
    })

    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
    }
  })
}

export function extractZipWindows(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })
  const ps = [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
  ]
  execFileSync('powershell.exe', ps, { stdio: 'pipe' })
}

export function findFileRecursive(dir: string, fileName: string): string | null {
  if (!existsSync(dir)) return null
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findFileRecursive(full, fileName)
      if (nested) return nested
      continue
    }
    if (entry.name.toLowerCase() === fileName.toLowerCase()) {
      return full
    }
  }
  return null
}

export function flattenLlamaBin(extractRoot: string, targetDir: string): string {
  const exePath = findFileRecursive(extractRoot, 'llama-server.exe')
  if (!exePath) {
    throw new Error('压缩包中未找到 llama-server.exe')
  }
  const sourceDir = join(exePath, '..')
  mkdirSync(targetDir, { recursive: true })
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const from = join(sourceDir, entry.name)
    const to = join(targetDir, entry.name)
    if (existsSync(to)) {
      try {
        unlinkSync(to)
      } catch {
        // ignore
      }
    }
    copyFileSync(from, to)
  }
  const flatExe = join(targetDir, 'llama-server.exe')
  if (!existsSync(flatExe)) {
    throw new Error('llama-server.exe 安装失败')
  }
  return flatExe
}

export function listGgufModelFiles(modelsDir: string): string[] {
  if (!existsSync(modelsDir)) return []
  return readdirSync(modelsDir)
    .filter((name) => name.toLowerCase().endsWith('.gguf'))
    .filter((name) => !name.toLowerCase().endsWith('.partial'))
    .filter((name) => {
      try {
        return statSync(join(modelsDir, name)).isFile()
      } catch {
        return false
      }
    })
    .sort((a, b) => a.localeCompare(b))
}

export function cleanupModelDownloadPartials(modelsDir: string, alsoRemoveDestPaths: string[] = []): void {
  for (const dest of alsoRemoveDestPaths) {
    removeDownloadArtifacts(dest)
  }
  if (!existsSync(modelsDir)) return
  for (const name of readdirSync(modelsDir)) {
    const lower = name.toLowerCase()
    if (lower.endsWith('.partial') || lower.endsWith('.expected')) {
      removePartialFile(join(modelsDir, name))
    }
  }
}

/**
 * 清扫未完成下载残留：*.partial / *.expected / 体积不达标的 .gguf。
 * **不会**删除已完整的模型文件。
 */
export function sweepIncompleteModelArtifacts(
  modelsDir: string,
  options?: { minUsableBytes?: number }
): string[] {
  const removed: string[] = []
  const minUsable = options?.minUsableBytes ?? 0
  if (!existsSync(modelsDir)) return removed

  for (const name of readdirSync(modelsDir)) {
    const lower = name.toLowerCase()
    if (!lower.endsWith('.partial') && !lower.endsWith('.expected')) continue
    removePartialFile(join(modelsDir, name))
    removed.push(name)
  }

  for (const name of listGgufModelFiles(modelsDir)) {
    const full = join(modelsDir, name)
    try {
      const size = statSync(full).size
      const tooSmall = minUsable > 0 && size < minUsable
      if (tooSmall || isIncompleteDownloadFile(full, size)) {
        removeDownloadArtifacts(full)
        removed.push(name)
      }
    } catch {
      // ignore
    }
  }
  return removed
}

export function hasIncompleteModelArtifacts(
  modelsDir: string,
  minUsableBytes = 0
): boolean {
  if (!existsSync(modelsDir)) return false
  for (const name of readdirSync(modelsDir)) {
    const lower = name.toLowerCase()
    if (lower.endsWith('.partial') || lower.endsWith('.expected')) return true
  }
  for (const name of listGgufModelFiles(modelsDir)) {
    const full = join(modelsDir, name)
    try {
      const size = statSync(full).size
      if ((minUsableBytes > 0 && size < minUsableBytes) || isIncompleteDownloadFile(full, size)) {
        return true
      }
    } catch {
      // ignore
    }
  }
  return false
}
