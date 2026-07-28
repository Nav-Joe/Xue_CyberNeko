/** 聊天分段调试：控制台 + 主进程 logs 文件 */
export function logChatSegmentDebug(message: string, detail?: string): void {
  const head = `[chat-segment] ${message}`
  if (detail?.trim()) {
    console.log(`${head}\n${detail}`)
  } else {
    console.log(head)
  }

  if (window.electronAPI?.logRendererInfo) {
    void window.electronAPI.logRendererInfo({
      scope: 'chat-segment',
      message,
      detail
    })
  }
}

/** 聊天 TTS 进度（BUG-TTS-01 P1-a）：写入 app-*.log，便于队头卡住追溯 */
export function logChatTtsDebug(message: string, detail?: string): void {
  const head = `[chat-tts] ${message}`
  if (detail?.trim()) {
    console.log(`${head}\n${detail}`)
  } else {
    console.log(head)
  }

  if (window.electronAPI?.logRendererInfo) {
    void window.electronAPI.logRendererInfo({
      scope: 'chat-tts',
      message,
      detail
    })
  }
}

/** 队头长时间未就绪等告警 */
export function logChatTtsWarn(message: string, detail?: string): void {
  const head = `[chat-tts] WARN ${message}`
  if (detail?.trim()) {
    console.warn(`${head}\n${detail}`)
  } else {
    console.warn(head)
  }

  if (window.electronAPI?.logRendererInfo) {
    void window.electronAPI.logRendererInfo({
      scope: 'chat-tts',
      message: `WARN ${message}`,
      detail
    })
  }
}
