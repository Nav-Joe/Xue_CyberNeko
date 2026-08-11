/**
 * 脏 chat-config JSON → 规范 ChatConfig（迁移 + 缺字段回落 defaults）。
 * 读写磁盘、密钥还原、给设置页看的 View 仍在 chat-config.ts。
 */
import { createDefaultChatConfig } from '../../../src/services/chat/chatConfigDefaults'
import { LLM_DEFAULT_TEMPERATURE } from '../../../src/services/chat/llmConstants'
import type { ChatConfig, ChatLlmMode, ChatOutputFormat } from '../../../src/services/chat/types'

export type ChatConfigFile = ChatConfig

export type LegacyChatConfig = Partial<ChatConfig> & {
  model?: string
  llamaBaseUrl?: string
  openaiBaseUrl?: string
  outputFormat?: ChatOutputFormat
  temperature?: number
  /** 磁盘密文（base64）；内存态 ChatConfigFile 只用明文 apiKey */
  apiKeyEnc?: string
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

function normalizeMemoryEnabled(raw: unknown, fallback = true): boolean {
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
  // 冷落镜像字段：落盘可有独立值，但热路径门闩只认 desireEnabled（勿在此改成门控源）
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeSttEnabled(raw: unknown, fallback = false): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeSttAutoSend(raw: unknown, fallback = false): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function normalizeSttBaseUrl(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw.trim() : fallback
}

function normalizeSttDeviceId(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw.trim() : fallback
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
    | 'sttEnabled'
    | 'sttAutoSend'
    | 'sttBaseUrl'
    | 'sttDeviceId'
  >,
  raw: LegacyChatConfig
): ChatConfigFile {
  // 缺字段 / 非法类型一律回落产品默认，禁止再手写 true/false/2 与 defaults 双份字面量
  const defaults = createDefaultChatConfig()
  return {
    ...config,
    ttsEnabled: normalizeTtsEnabled(raw.ttsEnabled, defaults.ttsEnabled),
    ttsParallelEnabled: normalizeTtsParallelEnabled(
      raw.ttsParallelEnabled,
      defaults.ttsParallelEnabled
    ),
    ttsParallelLanes: normalizeTtsParallelLanes(raw.ttsParallelLanes, defaults.ttsParallelLanes),
    openaiApiKeySecretSave: normalizeOpenAiApiKeySecretSave(
      raw.openaiApiKeySecretSave,
      defaults.openaiApiKeySecretSave
    ),
    memoryEnabled: normalizeMemoryEnabled(raw.memoryEnabled, defaults.memoryEnabled),
    memoryConsolidateOnChatClose: normalizeMemoryConsolidateOnChatClose(
      raw.memoryConsolidateOnChatClose,
      defaults.memoryConsolidateOnChatClose
    ),
    memoryLlmSummarizeEnabled: normalizeMemoryLlmSummarizeEnabled(
      raw.memoryLlmSummarizeEnabled,
      defaults.memoryLlmSummarizeEnabled
    ),
    memoryEmotionScoreEnabled: normalizeMemoryEmotionScoreEnabled(
      raw.memoryEmotionScoreEnabled,
      defaults.memoryEmotionScoreEnabled
    ),
    desireEnabled: normalizeDesireEnabled(raw.desireEnabled, defaults.desireEnabled),
    relationshipEnabled: normalizeRelationshipEnabled(
      raw.relationshipEnabled,
      defaults.relationshipEnabled
    ),
    sttEnabled: normalizeSttEnabled(raw.sttEnabled, defaults.sttEnabled),
    sttAutoSend: normalizeSttAutoSend(raw.sttAutoSend, defaults.sttAutoSend),
    sttBaseUrl: normalizeSttBaseUrl(raw.sttBaseUrl, defaults.sttBaseUrl),
    sttDeviceId: normalizeSttDeviceId(raw.sttDeviceId, defaults.sttDeviceId)
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

/** 读盘 / 写回合并后的入口：现代结构走 withTtsFields，否则走旧扁平迁移 */
export function normalizeConfig(raw: LegacyChatConfig): ChatConfigFile {
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
