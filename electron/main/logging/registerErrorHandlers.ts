import { app, type BrowserWindow } from 'electron'

import { logError, logFatal, logInfo, logStartupBanner, logWarn } from './logger'

export function attachWindowDiagnostics(win: BrowserWindow, label: string): void {
  const wc = win.webContents

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    logError('main', `${label} did-fail-load`, undefined, `code=${errorCode} url=${validatedURL} ${errorDescription}`)
  })

  wc.on('render-process-gone', (_event, details) => {
    logFatal(
      'main',
      `${label} render-process-gone`,
      undefined,
      `reason=${details.reason} exitCode=${details.exitCode}`
    )
  })

  wc.on('unresponsive', () => {
    logWarn('main', `${label} became unresponsive`)
  })

  wc.on('responsive', () => {
    logInfo('main', `${label} responsive again`)
  })
}

export function installMainErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    logFatal('main', 'uncaughtException', error)
  })

  process.on('unhandledRejection', (reason) => {
    logError('main', 'unhandledRejection', reason)
  })

  app.on('render-process-gone', (_event, _webContents, details) => {
    logFatal('main', 'app render-process-gone', undefined, `reason=${details.reason} exitCode=${details.exitCode}`)
  })

  app.on('child-process-gone', (_event, details) => {
    logWarn(
      'main',
      'child-process-gone',
      undefined,
      `type=${details.type} reason=${details.reason} exitCode=${details.exitCode} serviceName=${details.serviceName ?? ''}`
    )
  })

  logStartupBanner()
}

installMainErrorHandlers()
