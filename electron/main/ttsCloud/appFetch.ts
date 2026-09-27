/**
 * Electron 主进程外网请求：优先 Chromium `net.fetch`（跟系统代理/证书），
 * 再回退全局 fetch。避免 undici「fetch failed」而浏览器能通的情况。
 */
export type AppFetch = typeof fetch

export function getAppFetch(): AppFetch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as typeof import('electron')
    if (typeof electron.net?.fetch === 'function') {
      return electron.net.fetch.bind(electron.net) as AppFetch
    }
  } catch {
    /* vitest / 非 Electron */
  }
  return fetch
}

export function formatFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const parts = [error.message]
  const cause = (error as Error & { cause?: unknown }).cause
  if (cause instanceof Error && cause.message) {
    parts.push(cause.message)
  } else if (typeof cause === 'string' && cause.trim()) {
    parts.push(cause)
  }
  return parts.filter(Boolean).join(' | ')
}
