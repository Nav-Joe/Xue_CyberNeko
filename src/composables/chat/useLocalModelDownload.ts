/**
 * 聊天设置页：本地 GGUF 下载 / 取消 / 文件状态。
 * 与开窗 bootstrap（useChatLlamaBootstrap）分属不同 IPC，勿合并。
 */
import { onUnmounted, ref, type Ref } from 'vue'

import { DEFAULT_LOCAL_MODEL_ID } from '../../services/chat/llmConstants'

export type LocalModelDownloadHooks = {
  localStatus: Ref<string>
  configError: Ref<string>
  /** 下载成功且未取消后（例如重新扫描端点） */
  afterDownloadSuccess?: () => Promise<void>
}

export function useLocalModelDownload(hooks: LocalModelDownloadHooks) {
  const hasLocalModelFile = ref(false)
  const localModelFilename = ref<string | null>(null)
  const modelDownloading = ref(false)
  const modelDownloadMessage = ref('')
  const modelDownloadProgress = ref<{ done: number; total: number } | null>(null)

  let unbindModelDownloadProgress: (() => void) | null = null

  onUnmounted(() => {
    unbindModelDownloadProgress?.()
  })

  async function refreshLocalModelStatus(): Promise<void> {
    if (!window.electronAPI?.getLocalModelStatus) return
    const status = await window.electronAPI.getLocalModelStatus()
    hasLocalModelFile.value = status.hasLocalModelFile
    localModelFilename.value = status.modelFilename
  }

  function bindModelDownloadProgress(): void {
    unbindModelDownloadProgress?.()
    if (!window.electronAPI?.onChatLlamaBootstrapProgress) return
    unbindModelDownloadProgress = window.electronAPI.onChatLlamaBootstrapProgress((payload) => {
      modelDownloadMessage.value = payload.message
      modelDownloadProgress.value = payload.progress ?? null
    })
  }

  async function downloadLocalModel(): Promise<void> {
    if (!window.electronAPI?.downloadLocalModel || modelDownloading.value) return

    modelDownloading.value = true
    modelDownloadMessage.value = `准备下载 ${DEFAULT_LOCAL_MODEL_ID}…`
    modelDownloadProgress.value = null
    hooks.localStatus.value = ''
    hooks.configError.value = ''
    bindModelDownloadProgress()

    try {
      const result = await window.electronAPI.downloadLocalModel()
      if (!result.ok) {
        if (result.cancelled) {
          hooks.localStatus.value = '已取消下载，未完成文件已清理'
          await refreshLocalModelStatus()
          return
        }
        hooks.configError.value = result.detail
        return
      }

      await refreshLocalModelStatus()
      hooks.localStatus.value = result.serverStarted
        ? `已下载 ${DEFAULT_LOCAL_MODEL_ID}，llama-server 已启动`
        : `已下载 ${DEFAULT_LOCAL_MODEL_ID}`
      await hooks.afterDownloadSuccess?.()
    } catch (err) {
      hooks.configError.value = err instanceof Error ? err.message : '下载失败'
    } finally {
      unbindModelDownloadProgress?.()
      unbindModelDownloadProgress = null
      modelDownloading.value = false
      modelDownloadProgress.value = null
      modelDownloadMessage.value = ''
    }
  }

  async function cancelLocalModelDownload(): Promise<void> {
    if (!modelDownloading.value || !window.electronAPI?.cancelLocalModelDownload) return
    modelDownloadMessage.value = '正在取消下载并清理…'
    try {
      const result = await window.electronAPI.cancelLocalModelDownload()
      hooks.localStatus.value = result.detail
    } catch (err) {
      hooks.configError.value = err instanceof Error ? err.message : '取消下载失败'
    }
  }

  return {
    hasLocalModelFile,
    localModelFilename,
    modelDownloading,
    modelDownloadMessage,
    modelDownloadProgress,
    refreshLocalModelStatus,
    downloadLocalModel,
    cancelLocalModelDownload
  }
}
