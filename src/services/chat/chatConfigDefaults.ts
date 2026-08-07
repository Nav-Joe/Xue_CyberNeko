import { DEFAULT_LLAMA_BASE_URL, DEFAULT_OPENAI_BASE_URL, LLM_DEFAULT_TEMPERATURE } from './llmConstants'
import type { ChatConfig, ChatConfigView, LocalLlamaConfigView, OpenAiApiConfigView } from './types'

export function createDefaultLocalConfig(): LocalLlamaConfigView {
  return {
    selectedBaseUrl: DEFAULT_LLAMA_BASE_URL,
    selectedModelId: '',
    outputFormat: 'openai',
    temperature: LLM_DEFAULT_TEMPERATURE
  }
}

export function createDefaultOpenAiConfig(): OpenAiApiConfigView {
  return {
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    model: '',
    outputFormat: 'openai',
    temperature: LLM_DEFAULT_TEMPERATURE
  }
}

export function createDefaultChatConfigView(): ChatConfigView {
  return {
    llmMode: 'local_llama',
    local: createDefaultLocalConfig(),
    openai: createDefaultOpenAiConfig(),
    ttsEnabled: true,
    ttsParallelEnabled: false,
    ttsParallelLanes: 2,
    openaiApiKeySecretSave: false,
    memoryEnabled: true,
    memoryConsolidateOnChatClose: true,
    memoryLlmSummarizeEnabled: true,
    memoryEmotionScoreEnabled: true,
    desireEnabled: true,
    relationshipEnabled: true,
    sttEnabled: false,
    sttAutoSend: false,
    sttBaseUrl: '',
    sttDeviceId: '',
    hasApiKey: false
  }
}

export function createDefaultChatConfig(): ChatConfig {
  return {
    llmMode: 'local_llama',
    local: createDefaultLocalConfig(),
    openai: createDefaultOpenAiConfig(),
    ttsEnabled: true,
    ttsParallelEnabled: false,
    ttsParallelLanes: 2,
    openaiApiKeySecretSave: false,
    memoryEnabled: true,
    memoryConsolidateOnChatClose: true,
    memoryLlmSummarizeEnabled: true,
    memoryEmotionScoreEnabled: true,
    desireEnabled: true,
    relationshipEnabled: true,
    sttEnabled: false,
    sttAutoSend: false,
    sttBaseUrl: '',
    sttDeviceId: '',
    apiKey: ''
  }
}
