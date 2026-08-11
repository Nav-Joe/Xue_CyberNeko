import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

import {
  createDefaultChatConfig,
  createDefaultLocalConfig,
  createDefaultOpenAiConfig
} from '../../../src/services/chat/chatConfigDefaults'
import type { ChatConfigView, OpenAiApiConfigView } from '../../../src/services/chat/types'
import {
  buildDiskApiKeyFields,
  createSafeStorageApiKeyCrypto,
  resolveApiKeyFromDisk,
  type ApiKeyCrypto
} from './apiKeyAtRest'
import {
  normalizeConfig,
  type ChatConfigFile,
  type LegacyChatConfig
} from './chatConfigNormalize'

export type { ChatConfigFile }
export { createDefaultLocalConfig, createDefaultOpenAiConfig, createDefaultChatConfig }

const apiKeyCrypto: ApiKeyCrypto = createSafeStorageApiKeyCrypto()

function configFilePath(): string {
  return join(app.getPath('userData'), 'chat-config.json')
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
  // 布尔两套口径：默认开用 !== false（防误关）；默认关用 === true（防误开）。
  // 字段表见 CHAT_CONFIG.md「布尔字段读口径」；勿为整齐全局统一比较符。
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
    sttEnabled: config.sttEnabled === true,
    sttAutoSend: config.sttAutoSend === true,
    sttBaseUrl: typeof config.sttBaseUrl === 'string' ? config.sttBaseUrl.trim() : '',
    sttDeviceId: typeof config.sttDeviceId === 'string' ? config.sttDeviceId.trim() : '',
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
    sttEnabled: view.sttEnabled ?? current.sttEnabled,
    sttAutoSend: view.sttAutoSend ?? current.sttAutoSend,
    sttBaseUrl: view.sttBaseUrl ?? current.sttBaseUrl,
    sttDeviceId: view.sttDeviceId ?? current.sttDeviceId,
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
