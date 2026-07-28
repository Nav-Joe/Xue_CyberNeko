/**
 * 下载半成品 / 解压 / 模型目录清扫（OPT-12 B）。
 *
 * 只负责：`.partial` / `.expected`、zip 展平、GGUF 列表与 incomplete sweep。
 * 禁止：HTTP 拉取、AbortController 编排、IPC。
 * 边界见 `./CONTRACT.md` §文件职责。
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'

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
