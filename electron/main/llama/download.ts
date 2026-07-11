import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync
} from 'fs'
import { basename, dirname, join } from 'path'
import { execFileSync } from 'child_process'
import { get as httpsGet, request as httpsRequest } from 'https'

export type DownloadProgress = { done: number; total: number; label: string }

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

/** 部分 CDN 不支持 HEAD，用 Range 请求解析 Content-Range 总大小 */
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

export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })
  const label = basename(destPath)
  const knownTotal = await probeDownloadTotal(url)
  onProgress?.({ done: 0, total: knownTotal, label })
  await fetchToFile(url, destPath, onProgress, 5, knownTotal, label)
  const size = statSync(destPath).size
  onProgress?.({ done: size, total: knownTotal > 0 ? knownTotal : size, label })
}

function removePartialFile(destPath: string): void {
  if (!existsSync(destPath)) return
  try {
    unlinkSync(destPath)
  } catch {
    // ignore
  }
}

function downloadSourceLabel(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export type DownloadMirrorResult = { url: string; source: string }

/** 依次尝试多个镜像 URL，前一个失败时自动切换下一个 */
export async function downloadFileWithMirrors(
  urls: string[],
  destPath: string,
  onProgress?: (progress: DownloadProgress) => void,
  onMirrorAttempt?: (source: string, index: number, total: number) => void
): Promise<DownloadMirrorResult> {
  const candidates = urls.filter(Boolean)
  if (candidates.length === 0) {
    throw new Error('未配置下载地址')
  }

  let lastError: Error | null = null
  for (let index = 0; index < candidates.length; index += 1) {
    const url = candidates[index]
    const source = downloadSourceLabel(url)
    onMirrorAttempt?.(source, index, candidates.length)
    try {
      removePartialFile(destPath)
      await downloadFile(url, destPath, onProgress)
      return { url, source }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      removePartialFile(destPath)
    }
  }

  throw lastError ?? new Error('所有下载源均失败')
}

async function fetchToFile(
  url: string,
  destPath: string,
  onProgress: ((progress: DownloadProgress) => void) | undefined,
  redirectLeft: number,
  knownTotal: number,
  label: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    httpsGet(url, (response) => {
      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400 && response.headers.location && redirectLeft > 0) {
        response.resume()
        fetchToFile(
          followUrl(url, response.headers.location),
          destPath,
          onProgress,
          redirectLeft - 1,
          knownTotal,
          label
        )
          .then(resolve)
          .catch(reject)
        return
      }
      if (status !== 200 && status !== 206) {
        response.resume()
        reject(new Error(`下载失败 HTTP ${status}: ${url}`))
        return
      }

      const headerTotal = Number(response.headers['content-length'] ?? 0)
      const total = headerTotal > 0 ? headerTotal : knownTotal
      let done = 0
      let lastEmitAt = 0
      const file = createWriteStream(destPath)
      response.on('data', (chunk: Buffer) => {
        done += chunk.length
        const now = Date.now()
        if (now - lastEmitAt < 100 && done < total) return
        lastEmitAt = now
        onProgress?.({ done, total, label })
      })
      response.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', (err) => {
        file.close()
        reject(err)
      })
      response.on('error', reject)
    }).on('error', reject)
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

/** 将 zip 解压目录中的 llama-server.exe 与同目录 DLL 平铺到 llama_bin */
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
    .filter((name) => {
      try {
        return statSync(join(modelsDir, name)).isFile()
      } catch {
        return false
      }
    })
    .sort((a, b) => a.localeCompare(b))
}
