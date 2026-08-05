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
import {
  buildDiskApiKeyFields,
  createSafeStorageApiKeyCrypto,
  resolveApiKeyFromDisk,
  type ApiKeyCrypto
} from './apiKeyAtRest'

export type ChatConfigFile = ChatConfig

export { createDefaultLocalConfig, createDefaultOpenAiConfig, createDefaultChatConfig }

type LegacyChatConfig = Partial<ChatConfig> & {
  model?: string
  llamaBaseUrl?: string
  openaiBaseUrl?: string
  outputFormat?: ChatOutputFormat
  temperature?: number
  /** 磁盘密文（base64）；内存态 ChatConfigFile 只用明文 apiKey */
  apiKeyEnc?: string
}

const apiKeyCrypto: ApiKeyCrypto = createSafeStorageApiKeyCrypto()

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

function normalizeMemoryEnabled(raw: unknown, fallback = false): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeMemoryConsolidateOnChatClose(raw: unknown, fallback = true): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeMemoryLlmSummarizeEnabled(raw: unknown, fallback = true): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeMemoryEmotionScoreEnabled(raw: unknown, fallback = true): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeDesireEnabled(raw: unknown, fallback = true): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeRelationshipEnabled(raw: unknown, fallback = true): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function withTtsFields(
  config: Omit<
    ChatConfigFile,
    | 'ttsEnabled'
    | 'ttsParallelEnabled'
    | 'ttsParallelLanes'
    | 'openaiApiKeySecretSave'
    | 'memoryEnabled'
    | 'memoryConsolidateOnChatClose'
    | 'memoryLlmSummarizeEnabled'
    | 'memoryEmotionScoreEnabled'
    | 'desireEnabled'
    | 'relationshipEnabled'
  >,
  raw: LegacyChatConfig
): ChatConfigFile {
  return {
    ...config,
    ttsEnabled: normalizeTtsEnabled(raw.ttsEnabled, true),
    ttsParallelEnabled: normalizeTtsParallelEnabled(raw.ttsParallelEnabled, false),
    ttsParallelLanes: normalizeTtsParallelLanes(raw.ttsParallelLanes, 2),
    openaiApiKeySecretSave: normalizeOpenAiApiKeySecretSave(raw.openaiApiKeySecretSave, false),
    memoryEnabled: normalizeMemoryEnabled(raw.memoryEnabled, true),
    memoryConsolidateOnChatClose: normalizeMemoryConsolidateOnChatClose(
      raw.memoryConsolidateOnChatClose,
      true
    ),
    memoryLlmSummarizeEnabled: normalizeMemoryLlmSummarizeEnabled(raw.memoryLlmSummarizeEnabled, true),
    memoryEmotionScoreEnabled: normalizeMemoryEmotionScoreEnabled(
      raw.memoryEmotionScoreEnabled,
      true
    ),
    desireEnabled: normalizeDesireEnabled(raw.desireEnabled, true),
    relationshipEnabled: normalizeRelationshipEnabled(raw.relationshipEnabled, true)
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

function toDiskPayload(config: ChatConfigFile): Record<string, unknown> {
  const { apiKey: _memoryKey, ...rest } = config
  const keyFields = buildDiskApiKeyFields(config.apiKey ?? '', apiKeyCrypto)
  return { ...rest, ...keyFields }
}

function persistChatConfig(config: ChatConfigFile): void {
  writeFileSync(configFilePath(), `${JSON.stringify(toDiskPayload(config), null, 2)}\n`, 'utf-8')
}

function omitApiKeyFields<T extends Record<string, unknown>>(raw: T): Omit<T, 'apiKey' | 'apiKeyEnc'> {
  const { apiKey: _a, apiKeyEnc: _e, ...rest } = raw as T & ApiKeyDiskLoose
  return rest
}

type ApiKeyDiskLoose = { apiKey?: string; apiKeyEnc?: string }

function hydrateApiKey(raw: LegacyChatConfig, normalized: ChatConfigFile): {
  config: ChatConfigFile
  shouldRewrite: boolean
} {
  const { plain, shouldRewrite } = resolveApiKeyFromDisk(raw, apiKeyCrypto)
  const withKey: ChatConfigFile = { ...normalized, apiKey: plain }
  const hasEnc = typeof raw.apiKeyEnc === 'string' && Boolean(raw.apiKeyEnc.trim())
  // 已有明文、加密可用但磁盘尚无密文 → 补写（勿用密文相等判断：每次 encrypt 可能不同）
  const needsEncrypt = Boolean(plain.trim()) && apiKeyCrypto.isAvailable() && !hasEnc
  return { config: withKey, shouldRewrite: shouldRewrite || needsEncrypt }
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
    memoryEnabled: config.memoryEnabled === true,
    memoryConsolidateOnChatClose: config.memoryConsolidateOnChatClose !== false,
    memoryLlmSummarizeEnabled: config.memoryLlmSummarizeEnabled !== false,
    memoryEmotionScoreEnabled: config.memoryEmotionScoreEnabled !== false,
    desireEnabled: config.desireEnabled !== false,
    relationshipEnabled: config.relationshipEnabled !== false,
    hasApiKey,
    apiKey: !secretSave && hasApiKey ? apiKey : undefined
  }
}

export function readChatConfigFile(): ChatConfigFile {
  const filePath = configFilePath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  if (!existsSync(filePath)) {
    const initial = createDefaultChatConfig()
    persistChatConfig(initial)
    return initial
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as LegacyChatConfig
    const normalized = normalizeConfig(parsed)
    const { config, shouldRewrite } = hydrateApiKey(parsed, normalized)
    const fieldsChanged =
      JSON.stringify(omitApiKeyFields(parsed as Record<string, unknown>)) !==
      JSON.stringify(omitApiKeyFields(normalized as unknown as Record<string, unknown>))
    if (shouldRewrite || fieldsChanged) {
      persistChatConfig(config)
    }
    return config
  } catch {
    const fallback = createDefaultChatConfig()
    persistChatConfig(fallback)
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
    memoryEnabled: view.memoryEnabled ?? current.memoryEnabled,
    memoryConsolidateOnChatClose:
      view.memoryConsolidateOnChatClose ?? current.memoryConsolidateOnChatClose,
    memoryLlmSummarizeEnabled: view.memoryLlmSummarizeEnabled ?? current.memoryLlmSummarizeEnabled,
    memoryEmotionScoreEnabled: view.memoryEmotionScoreEnabled ?? current.memoryEmotionScoreEnabled,
    desireEnabled: view.desireEnabled ?? current.desireEnabled,
    relationshipEnabled: view.relationshipEnabled ?? current.relationshipEnabled,
    apiKey: view.clearApiKey ? '' : view.apiKey !== undefined ? view.apiKey : current.apiKey
  }
  // 合并结果已是内存明文；落盘由 persist → apiKeyEnc（勿再走磁盘 hydrate）
  const next = normalizeConfig(merged)
  persistChatConfig(next)
  return next
}

export function getChatConfigSecrets(): { openai: OpenAiApiConfigView; apiKey: string } {
  const config = readChatConfigFile()
  return { openai: config.openai, apiKey: config.apiKey ?? '' }
}
