/**
 * HTTP 下载与镜像回退。
 *
 * 只负责：probe / 写 partial / 镜像尝试 / Abort。
 * 禁止：zip 解压、模型目录 sweep、进程生命周期、IPC。
 * 边界见 `./CONTRACT.md` §文件职责。
 */
import { createWriteStream, mkdirSync, renameSync, statSync } from 'fs'
import { basename, dirname } from 'path'
import { get as httpsGet, request as httpsRequest, type ClientRequest } from 'https'
import type { IncomingMessage } from 'http'

import {
  clearExpectedDownloadSize,
  downloadPartialPath,
  removeDownloadArtifacts,
  removePartialFile,
  writeExpectedDownloadSize
} from './downloadArtifacts'

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
