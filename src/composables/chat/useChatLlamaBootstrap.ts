import { computed, ref } from 'vue'

import { reportClientError } from '../../services/errorReporter'

/**
 * 每调用方一份 UI 状态（遮罩 / 取消按钮）。
 * Pet·Home 与 Chat 窗分属不同渲染进程，出现「双实例」是 Electron 多窗口架构特征，非 bug。
 * 并发 begin / 下载取消 / 半成品清理以主进程为准（见 electron/main/llama/CONTRACT.md）。
 */
export function useChatLlamaBootstrap() {
  const chatBooting = ref(false)
  const bootTitle = ref('正在准备文字聊天')
  const bootMessage = ref('检查本地 llama-server…')
  const bootProgress = ref<{ done: number; total: number } | null>(null)
  const bootPhase = ref('')
  const cancellingDownload = ref(false)

  let unbindProgress: (() => void) | null = null

  const canCancelDownload = computed(
    () =>
      chatBooting.value &&
      !cancellingDownload.value &&
      (bootPhase.value === 'download_server' || bootPhase.value === 'download_model')
  )

  function bindProgress(): void {
    unbindProgress?.()
    if (!window.electronAPI?.onChatLlamaBootstrapProgress) return
    unbindProgress = window.electronAPI.onChatLlamaBootstrapProgress((payload) => {
      bootPhase.value = payload.phase
      bootMessage.value = payload.message
      bootProgress.value = payload.progress ?? null
      if (payload.phase === 'download_server' || payload.phase === 'download_model') {
        bootTitle.value = '正在下载本地大模型组件'
      } else if (payload.phase === 'start_server') {
        bootTitle.value = '正在启动 llama-server'
      } else {
        bootTitle.value = '正在准备文字聊天'
      }
    })
  }

  async function resolveDownloadModelChoice(): Promise<boolean> {
    const status = await window.electronAPI?.getLocalModelStatus?.()
    if (!status || status.hasLocalModelFile) return false

    const download = await window.electronAPI?.showConfirmDialog?.({
      title: '下载本地大模型',
      message: `未检测到本地 GGUF 模型文件。是否现在下载默认模型 ${status.defaultModelId}？（约 2 GB，需一定时间）`,
      confirmLabel: '下载'
    })
    if (download) return true

    await window.electronAPI?.showConfirmDialog?.({
      title: '已跳过下载',
      message: '您可以先进入文字聊天，稍后在聊天窗口「设置」中下载本地大模型。',
      confirmLabel: '知道了'
    })
    return false
  }

  async function cancelDownload(): Promise<void> {
    if (cancellingDownload.value) return
    cancellingDownload.value = true
    bootTitle.value = '正在取消下载'
    bootMessage.value = '清理未完成文件并停止 llama-server…'
    try {
      await window.electronAPI?.cancelLocalModelDownload?.()
    } catch (error) {
      reportClientError({
        scope: 'chat:bootstrap',
        message: '取消本地下载失败',
        detail: error instanceof Error ? error.message : String(error)
      })
    } finally {
      cancellingDownload.value = false
    }
  }

  /** 检测并在需要时启动 llama-server；已运行则静默成功 */
  async function ensureLocalLlamaReady(options?: { promptDownloadModel?: boolean }): Promise<boolean> {
    if (!window.electronAPI?.beginChatLlamaSession) return true

    // 点 X 中断下载后：进聊天先调和半成品 / orphan 下载，避免下次下载卡死
    try {
      await window.electronAPI.reconcileInterruptedLlamaDownloads?.()
    } catch (error) {
      reportClientError({
        scope: 'chat:bootstrap',
        message: '清理未完成本地下载失败',
        detail: error instanceof Error ? error.message : String(error)
      })
    }

    let downloadModel = false
    if (options?.promptDownloadModel !== false) {
      try {
        downloadModel = await resolveDownloadModelChoice()
      } catch (error) {
        reportClientError({
          scope: 'chat:bootstrap',
          message: '检查本地大模型状态失败',
          detail: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const probe = await window.electronAPI.probeLocalLlamaServer?.()
    const needsBootstrap = !probe?.serverRunning

    if (!needsBootstrap) {
      return true
    }

    chatBooting.value = true
    bootTitle.value = '正在准备文字聊天'
    bootMessage.value = '检查本地 llama-server…'
    bootProgress.value = null
    bootPhase.value = 'check'
    bindProgress()

    try {
      const result = await window.electronAPI.beginChatLlamaSession({ downloadModel })
      if (!result.ok) {
        if (result.detail === '已取消下载') {
          return false
        }
        reportClientError({
          scope: 'chat:bootstrap',
          message: '无法准备本地 llama-server',
          detail: result.detail
        })
        await window.electronAPI.showConfirmDialog?.({
          title: '无法启动本地大模型',
          message: result.detail,
          confirmLabel: '知道了'
        })
        return false
      }

      if (result.noticeMessage) {
        await window.electronAPI.showConfirmDialog?.({
          title: '本地大模型',
          message: result.noticeMessage,
          confirmLabel: '知道了'
        })
      }

      return true
    } catch (error) {
      reportClientError({
        scope: 'chat:bootstrap',
        message: '本地 llama-server 引导异常',
        detail: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      await window.electronAPI.showConfirmDialog?.({
        title: '无法启动本地大模型',
        message: error instanceof Error ? error.message : '未知错误',
        confirmLabel: '知道了'
      })
      return false
    } finally {
      unbindProgress?.()
      unbindProgress = null
      chatBooting.value = false
      bootProgress.value = null
      bootPhase.value = ''
      cancellingDownload.value = false
    }
  }

  return {
    chatBooting,
    bootTitle,
    bootMessage,
    bootProgress,
    canCancelDownload,
    cancellingDownload,
    cancelDownload,
    ensureLocalLlamaReady
  }
}
