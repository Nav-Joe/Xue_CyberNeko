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
