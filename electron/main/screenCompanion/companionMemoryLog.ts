/**
 * 陪玩会话临时日志：把旁白和屏幕摘要逐行追加到本地文件，退出游戏后再做记忆总结。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'

import { readMemoryFlags } from '../memory/flags'

export type CompanionMemoryLogKind = 'narrate' | 'observe'

export type CompanionMemoryLogEntry = {
  ts: number
  kind: CompanionMemoryLogKind
  gameName: string
  text: string
}

let logDirOverride: string | null = null

/** 单测注入 */
export function setCompanionMemoryLogTestHooks(hooks: { logDir?: string | null }): void {
  logDirOverride = hooks.logDir === undefined ? logDirOverride : hooks.logDir
}

function resolveLogDir(): string | null {
  if (logDirOverride) return logDirOverride
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron')
    if (!app?.getPath) return null
    return join(app.getPath('userData'), 'screen-companion-memory')
  } catch {
    return null
  }
}

export function resolveCompanionMemoryLogPath(companionSessionId: string): string {
  const dir = resolveLogDir()
  if (!dir) return join('screen-companion-memory', `${companionSessionId}.jsonl`)
  return join(dir, `${companionSessionId}.jsonl`)
}

export function isCompanionMemoryLoggingEnabled(): boolean {
  return readMemoryFlags().memoryEnabled
}

export function appendCompanionMemoryLog(
  companionSessionId: string,
  entry: Omit<CompanionMemoryLogEntry, 'ts'> & { ts?: number }
): void {
  if (!isCompanionMemoryLoggingEnabled()) return
  const text = entry.text.trim()
  if (!text) return
  const dir = resolveLogDir()
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  const line: CompanionMemoryLogEntry = {
    ts: entry.ts ?? Date.now(),
    kind: entry.kind,
    gameName: entry.gameName,
    text
  }
  appendFileSync(resolveCompanionMemoryLogPath(companionSessionId), `${JSON.stringify(line)}\n`, 'utf8')
}

export function readCompanionMemoryLog(companionSessionId: string): CompanionMemoryLogEntry[] {
  const path = resolveCompanionMemoryLogPath(companionSessionId)
  if (!existsSync(path)) return []
  const out: CompanionMemoryLogEntry[] = []
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    try {
      const parsed = JSON.parse(line) as Partial<CompanionMemoryLogEntry>
      if (typeof parsed.text !== 'string' || !parsed.text.trim()) continue
      if (parsed.kind !== 'narrate' && parsed.kind !== 'observe') continue
      out.push({
        ts: typeof parsed.ts === 'number' ? parsed.ts : Date.now(),
        kind: parsed.kind,
        gameName: typeof parsed.gameName === 'string' ? parsed.gameName : '',
        text: parsed.text.trim()
      })
    } catch {
      /* skip corrupt line */
    }
  }
  return out
}

export function removeCompanionMemoryLog(companionSessionId: string): void {
  const path = resolveCompanionMemoryLogPath(companionSessionId)
  if (!existsSync(path)) return
  rmSync(path, { force: true })
}
