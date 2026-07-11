export interface ClientErrorReport {
  scope?: string
  message: string
  detail?: string
  stack?: string
  url?: string
}

function currentWindowType(): string {
  return window.electronAPI?.getWindowType?.() ?? 'unknown'
}

export function reportClientError(report: ClientErrorReport): void {
  const payload = {
    ...report,
    windowType: currentWindowType(),
    url: report.url ?? window.location.href
  }
  if (window.electronAPI?.reportClientError) {
    void window.electronAPI.reportClientError(payload)
    return
  }
  console.error('[ClientError]', payload)
}

export function installErrorReporter(): void {
  window.addEventListener('error', (event) => {
    reportClientError({
      scope: 'renderer:window.onerror',
      message: event.message || 'window error',
      detail: `${event.filename}:${event.lineno}:${event.colno}`,
      stack: event.error instanceof Error ? event.error.stack : undefined
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const serialized =
      reason instanceof Error
        ? { message: reason.message, stack: reason.stack }
        : { message: typeof reason === 'string' ? reason : JSON.stringify(reason) }
    reportClientError({
      scope: 'renderer:unhandledrejection',
      message: serialized.message || 'Unhandled promise rejection',
      stack: serialized.stack
    })
  })
}

import type { App } from 'vue'

export function installVueErrorHandler(app: App): void {
  app.config.errorHandler = (err, _instance, info) => {
    reportClientError({
      scope: 'renderer:vue',
      message: err instanceof Error ? err.message : String(err),
      detail: info,
      stack: err instanceof Error ? err.stack : undefined
    })
  }
}
