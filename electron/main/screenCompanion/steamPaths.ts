/**
 * 定位本机 Steam 安装根目录（Windows 优先）。
 */
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const STEAM_EXE = 'steam.exe'

function looksLikeSteamRoot(dir: string): boolean {
  return existsSync(join(dir, STEAM_EXE)) || existsSync(join(dir, 'steamapps'))
}

/** 从 reg query 输出里抽 REG_SZ 值 */
export function parseRegSzValue(regOutput: string): string | null {
  const line = regOutput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /\bREG_SZ\b/i.test(l))
  if (!line) return null
  const parts = line.split(/\s+REG_SZ\s+/i)
  const value = parts[1]?.trim()
  return value || null
}

function querySteamPathFromRegistry(): string | null {
  if (process.platform !== 'win32') return null
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    )
    const path = parseRegSzValue(out)
    if (path && looksLikeSteamRoot(path)) return path
  } catch {
    // 无 Steam 或无权限：降级
  }
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'InstallPath'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    )
    const path = parseRegSzValue(out)
    if (path && looksLikeSteamRoot(path)) return path
  } catch {
    // ignore
  }
  return null
}

const COMMON_STEAM_ROOTS = [
  join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam'),
  join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Steam'),
  'C:\\Steam',
  'D:\\Steam',
  'E:\\Steam'
]

export function findSteamRoot(): string | null {
  const fromReg = querySteamPathFromRegistry()
  if (fromReg) return fromReg.replace(/\//g, '\\')

  for (const candidate of COMMON_STEAM_ROOTS) {
    if (looksLikeSteamRoot(candidate)) return candidate
  }
  return null
}
