/**
 * 向各渲染窗广播「开始/结束陪玩会话」，供聊天锁等 UI 订阅。
 */
import { BrowserWindow } from 'electron'

export type ScreenCompanionSessionEvent = {
  sessionActive: boolean
  playingGameName: string | null
  /** enter | no-tracked-process | interval-not-playing | switch-game | stop | … */
  reason: string
  ts: number
}

/** 广播到所有窗；无窗 / 非 Electron 环境静默。 */
export function emitScreenCompanionSession(event: ScreenCompanionSessionEvent): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('screen-companion-session', event)
      }
    }
  } catch {
    /* vitest 或 app 未就绪 */
  }
}
