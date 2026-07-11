import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { runtimeDir } from '../config/paths'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'

export interface ClientErrorPayload {
  scope?: string
  message: string
  detail?: string
  stack?: string
  url?: string
  windowType?: string
}

export function logsDir(): string {
  return join(runtimeDir(), 'logs')
}

export function dailyLogFilePath(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return join(logsDir(), `app-${y}-${m}-${d}.log`)
}

export function latestErrorLogPath(): string {
  return join(logsDir(), 'latest-error.log')
}

function timestampLocal(date = new Date()): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const ms = pad(date.getMilliseconds(), 3)
  const tz = -date.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const abs = Math.abs(tz)
  const th = pad(Math.floor(abs / 60))
  const tm = pad(abs % 60)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${ms}${sign}${th}:${tm}`
}

export function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name || 'Error', stack: error.stack }
  }
  if (typeof error === 'string') {
    return { message: error }
  }
  try {
    return { message: JSON.stringify(error) }
  } catch {
    return { message: String(error) }
  }
}

export function formatLogLine(input: {
  level: LogLevel
  scope: string
  message: string
  detail?: string
  stack?: string
  at?: Date
}): string {
  const parts = [`[${timestampLocal(input.at)}]`, `[${input.level}]`, `[${input.scope}]`, input.message]
  if (input.detail?.trim()) {
    parts.push(`| ${input.detail.trim().replace(/\s+/g, ' ')}`)
  }
  const head = parts.join(' ')
  if (input.stack?.trim()) {
    return `${head}\n${input.stack.trim()}\n`
  }
  return `${head}\n`
}

function ensureLogsDir(): void {
  mkdirSync(logsDir(), { recursive: true })
}

function writeLine(line: string, level: LogLevel): void {
  try {
    ensureLogsDir()
    appendFileSync(dailyLogFilePath(), line, 'utf-8')
    if (level === 'ERROR' || level === 'FATAL') {
      writeFileSync(latestErrorLogPath(), line, 'utf-8')
    }
  } catch {
    // 日志写入失败时至少打到控制台，避免二次崩溃
    console.error('[logger] failed to write log file')
    console.error(line)
  }
}

function emit(level: LogLevel, scope: string, message: string, error?: unknown, detail?: string): void {
  const serialized = error !== undefined ? serializeError(error) : null
  const line = formatLogLine({
    level,
    scope,
    message,
    detail: detail ?? (serialized && serialized.message !== message ? serialized.message : undefined),
    stack: serialized?.stack
  })
  writeLine(line, level)
  const consoleFn = level === 'ERROR' || level === 'FATAL' ? console.error : level === 'WARN' ? console.warn : console.log
  consoleFn(line.trimEnd())
}

export function logInfo(scope: string, message: string, detail?: string): void {
  emit('INFO', scope, message, undefined, detail)
}

export function logWarn(scope: string, message: string, error?: unknown, detail?: string): void {
  emit('WARN', scope, message, error, detail)
}

export function logError(scope: string, message: string, error?: unknown, detail?: string): void {
  emit('ERROR', scope, message, error, detail)
}

export function logFatal(scope: string, message: string, error?: unknown, detail?: string): void {
  emit('FATAL', scope, message, error, detail)
}

export function logClientError(payload: ClientErrorPayload): void {
  const scope = payload.scope?.trim() || `renderer:${payload.windowType ?? 'unknown'}`
  const detailParts = [payload.detail, payload.url ? `url=${payload.url}` : ''].filter(Boolean)
  emit('ERROR', scope, payload.message, undefined, detailParts.join(' | ') || undefined)
  if (payload.stack?.trim()) {
    try {
      appendFileSync(dailyLogFilePath(), `${payload.stack.trim()}\n`, 'utf-8')
      if (existsSync(latestErrorLogPath())) {
        appendFileSync(latestErrorLogPath(), `${payload.stack.trim()}\n`, 'utf-8')
      }
    } catch {
      // ignore
    }
  }
}

export function logStartupBanner(): void {
  logInfo(
    'main',
    'Application boot',
    `pid=${process.pid} packaged=${appIsPackaged()} electron=${process.versions.electron} node=${process.versions.node}`
  )
}

function appIsPackaged(): boolean {
  try {
    // 延迟 require 避免循环依赖 index
    const { app } = require('electron') as typeof import('electron')
    return app.isPackaged
  } catch {
    return false
  }
}
