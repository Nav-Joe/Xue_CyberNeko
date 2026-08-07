/** 渲染侧薄封装：主进程代启 / 停托管 STT */
export async function ensureSttServiceFromMain(): Promise<
  { ok: true; baseUrl: string; reused: boolean } | { ok: false; detail: string }
> {
  if (!window.electronAPI?.ensureSttService) {
    return { ok: false, detail: '当前环境不支持自动启动语音服务' }
  }
  return window.electronAPI.ensureSttService()
}

export async function stopManagedSttServiceFromMain(): Promise<{ ok: true; stopped: boolean }> {
  if (!window.electronAPI?.stopManagedSttService) {
    return { ok: true, stopped: false }
  }
  return window.electronAPI.stopManagedSttService()
}
