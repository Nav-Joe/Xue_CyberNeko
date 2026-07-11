import { createDefaultChatConfigView } from './chatConfigDefaults'
import type { ChatConfigView, ChatTtsParallelLanes } from './types'

export function cloneChatConfig<T>(config: T): T {
  return JSON.parse(JSON.stringify(config)) as T
}

export async function loadChatConfigView(): Promise<ChatConfigView> {
  if (!window.electronAPI?.readChatConfig) {
    return createDefaultChatConfigView()
  }
  return window.electronAPI.readChatConfig()
}

export async function saveChatConfig(
  config: ChatConfigView,
  options?: { apiKey?: string; clearApiKey?: boolean }
): Promise<ChatConfigView> {
  if (!window.electronAPI?.writeChatConfig) {
    throw new Error('当前环境不支持聊天配置持久化')
  }
  const payload = cloneChatConfig(config) as ChatConfigView & { apiKey?: string; clearApiKey?: boolean }
  if (options?.apiKey !== undefined) {
    payload.apiKey = options.apiKey
  }
  if (options?.clearApiKey) {
    payload.clearApiKey = true
  }
  return window.electronAPI.writeChatConfig(cloneChatConfig(payload) as typeof payload)
}

export async function saveLocalLlamaConfig(local: ChatConfigView['local']): Promise<ChatConfigView> {
  const current = await loadChatConfigView()
  return saveChatConfig({ ...current, local: cloneChatConfig(local) })
}

export async function saveOpenAiApiConfig(
  openai: ChatConfigView['openai'],
  options?: { apiKey?: string; clearApiKey?: boolean; openaiApiKeySecretSave?: boolean }
): Promise<ChatConfigView> {
  const current = await loadChatConfigView()
  return saveChatConfig(
    {
      ...current,
      openai: cloneChatConfig(openai),
      ...(options?.openaiApiKeySecretSave !== undefined
        ? { openaiApiKeySecretSave: options.openaiApiKeySecretSave }
        : {})
    },
    options
  )
}

export async function saveOpenAiApiKeySecretSave(openaiApiKeySecretSave: boolean): Promise<ChatConfigView> {
  const current = await loadChatConfigView()
  return saveChatConfig({ ...current, openaiApiKeySecretSave })
}

export async function setActiveLlmMode(mode: ChatConfigView['llmMode']): Promise<ChatConfigView> {
  const current = await loadChatConfigView()
  return saveChatConfig({ ...current, llmMode: mode })
}

export async function saveChatTtsEnabled(ttsEnabled: boolean): Promise<ChatConfigView> {
  return saveChatTtsSettings({ ttsEnabled })
}

export async function saveChatTtsSettings(partial: {
  ttsEnabled?: boolean
  ttsParallelEnabled?: boolean
  ttsParallelLanes?: ChatTtsParallelLanes
}): Promise<ChatConfigView> {
  const current = await loadChatConfigView()
  return saveChatConfig({
    ...current,
    ...partial
  })
}
