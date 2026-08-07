import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { projectRoot, runtimeDir } from '../config/paths'
import { STT_HOST, STT_PORT_CANDIDATES } from './constants'

export type SttHealthJson = {
  ok?: boolean
  service?: string
  modelReady?: boolean
}

export function resolveVenvPython(): string | null {
  const root = projectRoot()
  const win = join(root, '.venv', 'Scripts', 'python.exe')
  const unix = join(root, '.venv', 'bin', 'python')
  if (process.platform === 'win32' && existsSync(win)) return win
  if (existsSync(unix)) return unix
  if (existsSync(win)) return win
  return null
}

/** 侧车写入的端口提示（可选；探活仍以 HTTP 为准） */
export function readSttPortFileHint(): number | null {
  try {
    const raw = readFileSync(join(runtimeDir(), 'stt-server.port'), 'utf-8').trim()
    const port = Number(raw)
    if (Number.isInteger(port) && port > 0) return port
  } catch {
    /* ignore */
  }
  return null
}

export function sttCandidateBaseUrls(): string[] {
  const hint = readSttPortFileHint()
  const ports = hint
    ? [hint, ...STT_PORT_CANDIDATES.filter((p) => p !== hint)]
    : [...STT_PORT_CANDIDATES]
  return ports.map((p) => `http://${STT_HOST}:${p}`)
}

export async function fetchSttHealth(
  baseUrl: string,
  signal?: AbortSignal
): Promise<SttHealthJson | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, { method: 'GET', signal })
    if (!res.ok) return null
    const json = (await res.json()) as SttHealthJson
    if (json?.service !== 'stt') return null
    return json
  } catch {
    return null
  }
}

/** 扫候选表；优先返回 modelReady 的基址，其次返回进程活着的基址 */
export async function probeSttBaseUrl(signal?: AbortSignal): Promise<{
  baseUrl: string
  modelReady: boolean
} | null> {
  let live: { baseUrl: string; modelReady: boolean } | null = null
  for (const base of sttCandidateBaseUrls()) {
    const health = await fetchSttHealth(base, signal)
    if (!health) continue
    const modelReady = health.modelReady !== false
    if (modelReady) return { baseUrl: base, modelReady: true }
    live = { baseUrl: base, modelReady: false }
  }
  return live
}
