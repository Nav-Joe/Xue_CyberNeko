import { computed, onUnmounted, ref, watch } from 'vue'

import {
  loadChatConfigView,
  saveLocalLlamaConfig,
  saveOpenAiApiConfig,
  saveOpenAiApiKeySecretSave,
  setActiveLlmMode
} from '../../services/chat/chatConfigStore'
import { detectLocalLlamaEndpoints } from '../../services/chat/localLlamaDiscovery'
import { DEFAULT_LOCAL_MODEL_ID } from '../../services/chat/llmConstants'
import type { CharacterCard, ChatConfigView, ChatLlmMode, LocalLlamaEndpoint } from '../../services/chat/types'

export function useChatLlmSettings(
  getCard: () => CharacterCard | null,
  options?: {
    onConfigSaved?: () => void
    ensureLocalLlamaReady?: () => Promise<boolean>
  }
) {
  const config = ref<ChatConfigView | null>(null)
  const configLoading = ref(false)
  const configError = ref('')
  const localStatus = ref('')
  const openAiStatus = ref('')

  const endpoints = ref<LocalLlamaEndpoint[]>([])
  const scanning = ref(false)
  const scanError = ref('')

  const localDraft = ref<ChatConfigView['local'] | null>(null)
  const openAiDraft = ref<ChatConfigView['openai'] | null>(null)
  const apiKeyInput = ref('')
  const openaiApiKeySecretSave = ref(false)
  const localSaving = ref(false)
  const openAiSaving = ref(false)

  const hasLocalModelFile = ref(false)
  const localModelFilename = ref<string | null>(null)
  const modelDownloading = ref(false)
  const modelDownloadMessage = ref('')
  const modelDownloadProgress = ref<{ done: number; total: number } | null>(null)

  const onlineEndpoints = computed(() => endpoints.value.filter((item) => item.online))

  let unbindModelDownloadProgress: (() => void) | null = null

  let suppressAutoSave = false
  let localSaveTimer: ReturnType<typeof setTimeout> | null = null
  let openAiSaveTimer: ReturnType<typeof setTimeout> | null = null

  function notifyConfigSaved(): void {
    options?.onConfigSaved?.()
  }

  onUnmounted(() => {
    unbindModelDownloadProgress?.()
    if (localSaveTimer) clearTimeout(localSaveTimer)
    if (openAiSaveTimer) clearTimeout(openAiSaveTimer)
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

  async function reloadConfig(): Promise<void> {
    configLoading.value = true
    configError.value = ''
    suppressAutoSave = true
    try {
      config.value = await loadChatConfigView()
      localDraft.value = { ...config.value.local }
      openAiDraft.value = { ...config.value.openai }
      openaiApiKeySecretSave.value = config.value.openaiApiKeySecretSave === true
      apiKeyInput.value =
        !config.value.openaiApiKeySecretSave && config.value.apiKey ? config.value.apiKey : ''
      await refreshLocalModelStatus()
    } catch (err) {
      configError.value = err instanceof Error ? err.message : '加载配置失败'
    } finally {
      configLoading.value = false
      suppressAutoSave = false
    }
  }

  async function scanLocalLlama(): Promise<void> {
    scanning.value = true
    scanError.value = ''
    try {
      const savedUrl = localDraft.value?.selectedBaseUrl ?? config.value?.local.selectedBaseUrl
      endpoints.value = await detectLocalLlamaEndpoints(savedUrl ? [savedUrl] : [])
    } catch (err) {
      scanError.value = err instanceof Error ? err.message : '扫描失败'
    } finally {
      scanning.value = false
    }
  }

  async function downloadLocalModel(): Promise<void> {
    if (!window.electronAPI?.downloadLocalModel || modelDownloading.value) return

    modelDownloading.value = true
    modelDownloadMessage.value = `准备下载 ${DEFAULT_LOCAL_MODEL_ID}…`
    modelDownloadProgress.value = null
    localStatus.value = ''
    configError.value = ''
    bindModelDownloadProgress()

    try {
      const result = await window.electronAPI.downloadLocalModel()
      if (!result.ok) {
        if (result.cancelled) {
          localStatus.value = '已取消下载，未完成文件已清理'
          await refreshLocalModelStatus()
          return
        }
        configError.value = result.detail
        return
      }

      await refreshLocalModelStatus()
      localStatus.value = result.serverStarted
        ? `已下载 ${DEFAULT_LOCAL_MODEL_ID}，llama-server 已启动`
        : `已下载 ${DEFAULT_LOCAL_MODEL_ID}`
      await scanLocalLlama()
    } catch (err) {
      configError.value = err instanceof Error ? err.message : '下载失败'
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
      localStatus.value = result.detail
    } catch (err) {
      configError.value = err instanceof Error ? err.message : '取消下载失败'
    }
  }

  function selectLocalModel(baseUrl: string, modelId: string): void {
    if (!localDraft.value) return
    localDraft.value.selectedBaseUrl = baseUrl
    localDraft.value.selectedModelId = modelId
    void saveLocalConfig({ silent: true })
  }

  function isLocalModelSelected(baseUrl: string, modelId: string): boolean {
    return (
      localDraft.value?.selectedBaseUrl === baseUrl && localDraft.value?.selectedModelId === modelId
    )
  }

  async function switchActiveMode(mode: ChatLlmMode): Promise<void> {
    if (!config.value || config.value.llmMode === mode) return
    configError.value = ''
    try {
      config.value = await setActiveLlmMode(mode)
      notifyConfigSaved()

      if (mode === 'local_llama') {
        openAiStatus.value = ''
        const probe = await window.electronAPI?.probeLocalLlamaServer?.()
        if (probe?.serverRunning) {
          await scanLocalLlama()
          localStatus.value = '已切换为本地大模型（llama-server 已在运行）'
          return
        }

        const bootstrap = options?.ensureLocalLlamaReady
        if (!bootstrap) {
          localStatus.value = '已切换为本地大模型（已保存）'
          return
        }

        const ready = await bootstrap()
        if (!ready) {
          configError.value = '本地 llama-server 未能启动，请检查模型文件与端口占用'
          localStatus.value = ''
          return
        }

        await scanLocalLlama()
        await refreshLocalModelStatus()
        localStatus.value = '已切换为本地大模型，llama-server 已就绪'
      } else {
        openAiStatus.value = '已切换为第三方 API（已保存）'
        localStatus.value = ''
      }
    } catch (err) {
      configError.value = err instanceof Error ? err.message : '切换模式失败'
    }
  }

  async function saveLocalConfig(saveOptions?: { silent?: boolean }): Promise<void> {
    if (!localDraft.value || suppressAutoSave) return
    if (!localDraft.value.selectedModelId.trim()) return
    localSaving.value = true
    configError.value = ''
    try {
      config.value = await saveLocalLlamaConfig(localDraft.value)
      localDraft.value = { ...config.value.local }
      if (!saveOptions?.silent) {
        localStatus.value = '本地模型配置已保存'
      }
      notifyConfigSaved()
    } catch (err) {
      configError.value = err instanceof Error ? err.message : '保存本地配置失败'
    } finally {
      localSaving.value = false
    }
  }

  async function saveOpenAiConfig(saveOptions?: { silent?: boolean; includeApiKey?: boolean }): Promise<void> {
    if (!openAiDraft.value || suppressAutoSave) return
    openAiSaving.value = true
    configError.value = ''
    try {
      const key = apiKeyInput.value.trim()
      const options =
        saveOptions?.includeApiKey && key.length > 0 ? { apiKey: key } : undefined
      config.value = await saveOpenAiApiConfig(openAiDraft.value, {
        ...options,
        openaiApiKeySecretSave: openaiApiKeySecretSave.value
      })
      openAiDraft.value = { ...config.value.openai }
      openaiApiKeySecretSave.value = config.value.openaiApiKeySecretSave === true
      if (config.value.openaiApiKeySecretSave) {
        apiKeyInput.value = ''
      } else {
        apiKeyInput.value = config.value.apiKey ?? apiKeyInput.value
      }
      if (!saveOptions?.silent) {
        openAiStatus.value = 'OpenAI 配置已保存'
      }
      notifyConfigSaved()
    } catch (err) {
      configError.value = err instanceof Error ? err.message : '保存 OpenAI 配置失败'
    } finally {
      openAiSaving.value = false
    }
  }

  async function onOpenAiApiKeySecretSaveToggle(): Promise<void> {
    if (suppressAutoSave) return
    openAiSaving.value = true
    configError.value = ''
    try {
      config.value = await saveOpenAiApiKeySecretSave(openaiApiKeySecretSave.value)
      openaiApiKeySecretSave.value = config.value.openaiApiKeySecretSave === true
      apiKeyInput.value =
        !config.value.openaiApiKeySecretSave && config.value.apiKey ? config.value.apiKey : ''
      openAiStatus.value = openaiApiKeySecretSave.value
        ? '已开启 API Key 私密保存'
        : '已关闭 API Key 私密保存'
      notifyConfigSaved()
    } catch (err) {
      configError.value = err instanceof Error ? err.message : '保存失败'
    } finally {
      openAiSaving.value = false
    }
  }

  watch(
    localDraft,
    (draft) => {
      if (suppressAutoSave || !draft) return
      if (localSaveTimer) clearTimeout(localSaveTimer)
      localSaveTimer = setTimeout(() => {
        void saveLocalConfig({ silent: true })
      }, 400)
    },
    { deep: true }
  )

  watch(
    openAiDraft,
    (draft) => {
      if (suppressAutoSave || !draft) return
      if (openAiSaveTimer) clearTimeout(openAiSaveTimer)
      openAiSaveTimer = setTimeout(() => {
        void saveOpenAiConfig({ silent: true })
      }, 400)
    },
    { deep: true }
  )

  return {
    config,
    configLoading,
    configError,
    localStatus,
    openAiStatus,
    endpoints,
    scanning,
    scanError,
    onlineEndpoints,
    hasLocalModelFile,
    localModelFilename,
    modelDownloading,
    modelDownloadMessage,
    modelDownloadProgress,
    localDraft,
    openAiDraft,
    apiKeyInput,
    openaiApiKeySecretSave,
    localSaving,
    openAiSaving,
    reloadConfig,
    scanLocalLlama,
    downloadLocalModel,
    cancelLocalModelDownload,
    selectLocalModel,
    isLocalModelSelected,
    saveLocalConfig,
    saveOpenAiConfig,
    onOpenAiApiKeySecretSaveToggle,
    switchActiveMode
  }
}
