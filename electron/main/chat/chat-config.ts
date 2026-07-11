import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

import {
  createDefaultChatConfig,
  createDefaultLocalConfig,
  createDefaultOpenAiConfig
} from '../../../src/services/chat/chatConfigDefaults'
import {
  DEFAULT_LLAMA_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  LLM_DEFAULT_TEMPERATURE
} from '../../../src/services/chat/llmConstants'
import type {
  ChatConfig,
  ChatConfigView,
  ChatLlmMode,
  ChatOutputFormat,
  LocalLlamaConfigView,
  OpenAiApiConfigView
} from '../../../src/services/chat/types'

export type ChatConfigFile = ChatConfig

export { createDefaultLocalConfig, createDefaultOpenAiConfig, createDefaultChatConfig }

type LegacyChatConfig = Partial<ChatConfig> & {
  model?: string
  llamaBaseUrl?: string
  openaiBaseUrl?: string
  outputFormat?: ChatOutputFormat
  temperature?: number
}

function configFilePath(): string {
  return join(app.getPath('userData'), 'chat-config.json')
}

function normalizeMode(raw: unknown): ChatLlmMode {
  return raw === 'openai_api' ? 'openai_api' : 'local_llama'
}

function normalizeOutputFormat(raw: unknown): ChatOutputFormat {
  return raw === 'json_content' ? 'json_content' : 'openai'
}

function normalizeTemperature(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
}

function normalizeTtsEnabled(raw: unknown, fallback = true): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeTtsParallelEnabled(raw: unknown, fallback = false): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeTtsParallelLanes(raw: unknown, fallback: 2 | 3 | 4 = 2): 2 | 3 | 4 {
  if (raw === 3 || raw === 4) return raw
  return fallback
}

function normalizeOpenAiApiKeySecretSave(raw: unknown, fallback = false): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function withTtsFields(
  config: Omit<
    ChatConfigFile,
    'ttsEnabled' | 'ttsParallelEnabled' | 'ttsParallelLanes' | 'openaiApiKeySecretSave'
  >,
  raw: LegacyChatConfig
): ChatConfigFile {
  return {
    ...config,
    ttsEnabled: normalizeTtsEnabled(raw.ttsEnabled, true),
    ttsParallelEnabled: normalizeTtsParallelEnabled(raw.ttsParallelEnabled, false),
    ttsParallelLanes: normalizeTtsParallelLanes(raw.ttsParallelLanes, 2),
    openaiApiKeySecretSave: normalizeOpenAiApiKeySecretSave(raw.openaiApiKeySecretSave, false)
  }
}

function migrateLegacyConfig(raw: LegacyChatConfig): ChatConfigFile {
  const defaults = createDefaultChatConfig()
  const legacyMode = normalizeMode(raw.llmMode)
  const legacyFormat = normalizeOutputFormat(raw.outputFormat)
  const legacyTemp = normalizeTemperature(raw.temperature, LLM_DEFAULT_TEMPERATURE)
  const legacyModel = typeof raw.model === 'string' ? raw.model : ''

  return withTtsFields(
    {
      llmMode: legacyMode,
      local: {
        selectedBaseUrl:
          typeof raw.llamaBaseUrl === 'string' && raw.llamaBaseUrl.trim()
            ? raw.llamaBaseUrl.trim()
            : defaults.local.selectedBaseUrl,
        selectedModelId: legacyMode === 'local_llama' ? legacyModel : defaults.local.selectedModelId,
        outputFormat: raw.local?.outputFormat ? normalizeOutputFormat(raw.local.outputFormat) : legacyFormat,
        temperature: raw.local?.temperature ?? legacyTemp
      },
      openai: {
        baseUrl:
          typeof raw.openaiBaseUrl === 'string' && raw.openaiBaseUrl.trim()
            ? raw.openaiBaseUrl.trim()
            : defaults.openai.baseUrl,
        model: legacyMode === 'openai_api' ? legacyModel : defaults.openai.model,
        outputFormat: raw.openai?.outputFormat ? normalizeOutputFormat(raw.openai.outputFormat) : legacyFormat,
        temperature: raw.openai?.temperature ?? legacyTemp
      },
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : defaults.apiKey
    },
    raw
  )
}

function normalizeConfig(raw: LegacyChatConfig): ChatConfigFile {
  if (raw.local && raw.openai) {
    const defaults = createDefaultChatConfig()
    return withTtsFields(
      {
        llmMode: normalizeMode(raw.llmMode),
        local: {
          selectedBaseUrl:
            typeof raw.local.selectedBaseUrl === 'string' && raw.local.selectedBaseUrl.trim()
              ? raw.local.selectedBaseUrl.trim()
              : defaults.local.selectedBaseUrl,
          selectedModelId: typeof raw.local.selectedModelId === 'string' ? raw.local.selectedModelId : '',
          outputFormat: normalizeOutputFormat(raw.local.outputFormat),
          temperature: normalizeTemperature(raw.local.temperature, defaults.local.temperature)
        },
        openai: {
          baseUrl:
            typeof raw.openai.baseUrl === 'string' && raw.openai.baseUrl.trim()
              ? raw.openai.baseUrl.trim()
              : defaults.openai.baseUrl,
          model: typeof raw.openai.model === 'string' ? raw.openai.model : '',
          outputFormat: normalizeOutputFormat(raw.openai.outputFormat),
          temperature: normalizeTemperature(raw.openai.temperature, defaults.openai.temperature)
        },
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : defaults.apiKey
      },
      raw
    )
  }
  return migrateLegacyConfig(raw)
}

export function toChatConfigView(config: ChatConfigFile): ChatConfigView {
  const apiKey = config.apiKey?.trim() ?? ''
  const hasApiKey = Boolean(apiKey)
  const secretSave = config.openaiApiKeySecretSave === true
  return {
    llmMode: config.llmMode,
    local: { ...config.local },
    openai: { ...config.openai },
    ttsEnabled: config.ttsEnabled,
    ttsParallelEnabled: config.ttsParallelEnabled,
    ttsParallelLanes: config.ttsParallelLanes,
    openaiApiKeySecretSave: secretSave,
    hasApiKey,
    apiKey: !secretSave && hasApiKey ? apiKey : undefined
  }
}

export function readChatConfigFile(): ChatConfigFile {
  const filePath = configFilePath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  if (!existsSync(filePath)) {
    const initial = createDefaultChatConfig()
    writeFileSync(filePath, `${JSON.stringify(initial, null, 2)}\n`, 'utf-8')
    return initial
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as LegacyChatConfig
    const normalized = normalizeConfig(parsed)
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
    }
    return normalized
  } catch {
    const fallback = createDefaultChatConfig()
    writeFileSync(filePath, `${JSON.stringify(fallback, null, 2)}\n`, 'utf-8')
    return fallback
  }
}

export type ChatConfigWritePatch = ChatConfigView & {
  apiKey?: string
  clearApiKey?: boolean
}

export function writeChatConfigFile(view: ChatConfigWritePatch): ChatConfigFile {
  const current = readChatConfigFile()
  const merged: LegacyChatConfig = {
    ...current,
    llmMode: view.llmMode ?? current.llmMode,
    local: view.local ?? current.local,
    openai: view.openai ?? current.openai,
    ttsEnabled: view.ttsEnabled ?? current.ttsEnabled,
    ttsParallelEnabled: view.ttsParallelEnabled ?? current.ttsParallelEnabled,
    ttsParallelLanes: view.ttsParallelLanes ?? current.ttsParallelLanes,
    openaiApiKeySecretSave: view.openaiApiKeySecretSave ?? current.openaiApiKeySecretSave,
    apiKey: view.clearApiKey ? '' : view.apiKey !== undefined ? view.apiKey : current.apiKey
  }
  const next = normalizeConfig(merged)
  writeFileSync(configFilePath(), `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
  return next
}

export function getChatConfigSecrets(): { openai: OpenAiApiConfigView; apiKey: string } {
  const config = readChatConfigFile()
  return { openai: config.openai, apiKey: config.apiKey ?? '' }
}
