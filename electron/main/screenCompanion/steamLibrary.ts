/**
 * 解析 Steam 库并列出 steamapps/common 下游戏目录。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { SteamGameRoot } from './types'

/** 从 libraryfolders.vdf 文本抽出所有 "path" "..." 值（宽松，不引入 VDF 库） */
export function extractLibraryPathsFromVdf(vdfText: string): string[] {
  const paths: string[] = []
  const re = /"path"\s*"([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(vdfText)) !== null) {
    const raw = m[1]?.replace(/\\\\/g, '\\').trim()
    if (raw) paths.push(raw)
  }
  return paths
}

function normalizeRoot(p: string): string {
  return p.replace(/\//g, '\\').replace(/[\\/]+$/, '')
}

/** 收集库根：Steam 安装目录 + VDF 中的 path（须含 steamapps） */
export function collectSteamLibraryRoots(steamRoot: string, readFile: (p: string) => string | null = defaultRead): string[] {
  const roots = new Set<string>()
  const main = normalizeRoot(steamRoot)
  if (existsSync(join(main, 'steamapps'))) roots.add(main)

  const vdfCandidates = [
    join(main, 'config', 'libraryfolders.vdf'),
    join(main, 'steamapps', 'libraryfolders.vdf')
  ]
  for (const vdfPath of vdfCandidates) {
    const text = readFile(vdfPath)
    if (!text) continue
    for (const lib of extractLibraryPathsFromVdf(text)) {
      const n = normalizeRoot(lib)
      if (existsSync(join(n, 'steamapps'))) roots.add(n)
    }
  }
  return [...roots]
}

function defaultRead(p: string): string | null {
  try {
    if (!existsSync(p)) return null
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** 列出各库 steamapps/common 下一层游戏文件夹 */
export function listGameRootsFromLibraries(libraryRoots: string[]): SteamGameRoot[] {
  const out: SteamGameRoot[] = []
  const seen = new Set<string>()

  for (const lib of libraryRoots) {
    const common = join(lib, 'steamapps', 'common')
    if (!existsSync(common)) continue
    let entries: string[] = []
    try {
      entries = readdirSync(common)
    } catch {
      continue
    }
    for (const name of entries) {
      const gameRoot = join(common, name)
      try {
        if (!statSync(gameRoot).isDirectory()) continue
      } catch {
        continue
      }
      const key = gameRoot.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ gameName: name, gameRoot })
    }
  }
  return out
}

export function listGameRoots(steamRoot: string): SteamGameRoot[] {
  return listGameRootsFromLibraries(collectSteamLibraryRoots(steamRoot))
}
