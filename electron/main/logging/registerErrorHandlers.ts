import { app, type BrowserWindow } from 'electron'

import { logError, logFatal, logInfo, logStartupBanner, logWarn } from './logger'

/**
 * 窗级诊断：崩溃 / 无响应 / **未关窗却整页重载**。
 * 聊天恶性 BUG（最小化回来气泡没了）优先看 loadCount≥2 的 WARN。
 */
export function attachWindowDiagnostics(win: BrowserWindow, label: string): void {
  const wc = win.webContents
  /** 主文档完成加载次数；>1 且窗未 destroyed ≈ 静默重载 */
  let mainLoadCount = 0

  function windowFlags(): string {
    if (win.isDestroyed()) return 'destroyed=true'
    return `destroyed=false minimized=${win.isMinimized()} visible=${win.isVisible()} focused=${win.isFocused()}`
  }

  wc.on('did-start-loading', () => {
    // 子 frame 也会冒泡；用 isLoadingMainFrame 区分整页
    if (!wc.isLoadingMainFrame()) return
    logInfo(
      'main',
      `${label} did-start-loading`,
      `loadAboutToBe=${mainLoadCount + 1} ${windowFlags()} url=${wc.getURL() || '(empty)'}`
    )
  })

  wc.on('did-finish-load', () => {
    mainLoadCount += 1
    const detail = `loadCount=${mainLoadCount} ${windowFlags()} url=${wc.getURL() || '(empty)'}`
    if (mainLoadCount >= 2) {
      // 窗还在却再次 finish-load：聊天会话内存会被清空；对照用户「只最小化」复现
      logWarn(
        'main',
        `${label} silent reload suspected (did-finish-load while window alive)`,
        undefined,
        detail
      )
      return
    }
    logInfo('main', `${label} did-finish-load`, detail)
  })

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    logError(
      'main',
      `${label} did-fail-load`,
      undefined,
      `code=${errorCode} url=${validatedURL} ${errorDescription} ${windowFlags()}`
    )
  })

  wc.on('render-process-gone', (_event, details) => {
    logFatal(
      'main',
      `${label} render-process-gone`,
      undefined,
      `reason=${details.reason} exitCode=${details.exitCode} ${windowFlags()}`
    )
  })

  wc.on('unresponsive', () => {
    logWarn('main', `${label} became unresponsive`, undefined, windowFlags())
  })

  wc.on('responsive', () => {
    logInfo('main', `${label} responsive again`, windowFlags())
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
