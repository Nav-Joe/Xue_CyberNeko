import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import {
  buildDiskApiKeyFields,
  createSafeStorageApiKeyCrypto,
  resolveApiKeyFromDisk,
  type ApiKeyCrypto
} from '../chat/apiKeyAtRest'
import { resolveActiveQwenVoice, upsertOfficialVcVoice } from './activeVoice'
import { isSafeCloudLocalVoiceId } from './cloudCachePaths'
import {
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_VC_MODEL,
  DEFAULT_QWEN_VD_MODEL,
  type QwenCloudVoice,
  type QwenVoiceKind,
  type TtsBackend,
  type TtsCloudConfig,
  type TtsCloudConfigDisk,
  type TtsCloudConfigPatch,
  type TtsCloudConfigView
} from './types'

export type TtsCloudConfigStoreDeps = {
  getUserDataPath: () => string
  crypto?: ApiKeyCrypto
}

const defaultCrypto: ApiKeyCrypto = createSafeStorageApiKeyCrypto()

function configPath(userData: string): string {
  return join(userData, 'tts-cloud-config.json')
}

export function createDefaultTtsCloudConfig(): TtsCloudConfig {
  return {
    ttsBackend: 'local',
    qwen: {
      baseUrl: DEFAULT_QWEN_BASE_URL,
      vcModel: DEFAULT_QWEN_VC_MODEL,
      vdModel: DEFAULT_QWEN_VD_MODEL,
      voices: [],
      activeVoiceLocalId: '',
      apiKey: '',
      secretSave: false
    }
  }
}

/** 仅 qwen 为云端；旧 fish/minimax 回落 local */
function asBackend(raw: unknown): TtsBackend {
  return raw === 'qwen' ? 'qwen' : 'local'
}

function normalizeModel(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return fallback
}

function asVoiceKind(raw: unknown): QwenVoiceKind {
  return raw === 'vd' ? 'vd' : 'vc'
}

function normalizeVoices(raw: unknown): QwenCloudVoice[] {
  if (!Array.isArray(raw)) return []
  const out: QwenCloudVoice[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const voiceId = typeof row.voiceId === 'string' ? row.voiceId.trim() : ''
    // 脏 id（如 `..`）不得进配置，否则下游 join 缓存目录可穿越删盘
    if (!id || !voiceId || !isSafeCloudLocalVoiceId(id)) continue
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id
    const createdAt =
      typeof row.createdAt === 'number' && Number.isFinite(row.createdAt)
        ? row.createdAt
        : Date.now()
    out.push({
      id,
      kind: asVoiceKind(row.kind),
      name,
      voiceId,
      createdAt
    })
  }
  return out
}

function normalizeDisk(raw: TtsCloudConfigDisk, crypto: ApiKeyCrypto): {
  config: TtsCloudConfig
  shouldRewrite: boolean
} {
  const q = raw.qwen ?? {}
  const { plain, shouldRewrite } = resolveApiKeyFromDisk(
    { apiKey: q.apiKey, apiKeyEnc: q.apiKeyEnc },
    crypto
  )
  const hasEnc = typeof q.apiKeyEnc === 'string' && Boolean(q.apiKeyEnc.trim())
  const needsEncrypt = Boolean(plain.trim()) && crypto.isAvailable() && !hasEnc

  const baseUrl =
    typeof q.baseUrl === 'string' && q.baseUrl.trim() ? q.baseUrl.trim() : DEFAULT_QWEN_BASE_URL

  const legacyModel = typeof q.model === 'string' ? q.model.trim() : ''
  const hasVcModelField = typeof q.vcModel === 'string' && Boolean(q.vcModel.trim())
  const hasVdModelField = typeof q.vdModel === 'string' && Boolean(q.vdModel.trim())
  const vcModel = normalizeModel(q.vcModel ?? legacyModel, DEFAULT_QWEN_VC_MODEL)
  const vdModel = normalizeModel(q.vdModel, DEFAULT_QWEN_VD_MODEL)

  let voices = normalizeVoices(q.voices)
  let activeVoiceLocalId =
    typeof q.activeVoiceLocalId === 'string' ? q.activeVoiceLocalId.trim() : ''
  const legacyVoiceId = typeof q.voiceId === 'string' ? q.voiceId.trim() : ''

  let migratedLegacyVoice = false
  if (voices.length === 0 && legacyVoiceId) {
    const id = `vc-migrated-${legacyVoiceId.slice(0, 12)}`
    voices = [
      {
        id,
        kind: 'vc',
        name: '官方样本云克隆',
        voiceId: legacyVoiceId,
        createdAt: Date.now()
      }
    ]
    activeVoiceLocalId = id
    migratedLegacyVoice = true
  }

  if (activeVoiceLocalId && !voices.some((v) => v.id === activeVoiceLocalId)) {
    activeVoiceLocalId = voices[0]?.id ?? ''
  }
  if (!activeVoiceLocalId && voices.length > 0) {
    activeVoiceLocalId = voices[0].id
  }

  const hadLegacyVendor =
    raw.ttsBackend === 'fish' ||
    raw.ttsBackend === 'minimax' ||
    (raw.fish != null && typeof raw.fish === 'object') ||
    (raw.minimax != null && typeof raw.minimax === 'object')

  const needsShapeRewrite =
    !hasVcModelField ||
    !hasVdModelField ||
    migratedLegacyVoice ||
    Boolean(legacyModel) ||
    Boolean(legacyVoiceId)

  return {
    config: {
      ttsBackend: asBackend(raw.ttsBackend),
      qwen: {
        baseUrl,
        vcModel,
        vdModel,
        voices,
        activeVoiceLocalId,
        apiKey: plain,
        secretSave: q.secretSave === true
      }
    },
    shouldRewrite: shouldRewrite || needsEncrypt || needsShapeRewrite || hadLegacyVendor
  }
}

function toDiskPayload(config: TtsCloudConfig, crypto: ApiKeyCrypto): Record<string, unknown> {
  const keyFields = buildDiskApiKeyFields(config.qwen.apiKey, crypto)
  return {
    ttsBackend: config.ttsBackend,
    qwen: {
      baseUrl: config.qwen.baseUrl,
      vcModel: config.qwen.vcModel.trim() || DEFAULT_QWEN_VC_MODEL,
      vdModel: config.qwen.vdModel.trim() || DEFAULT_QWEN_VD_MODEL,
      voices: config.qwen.voices,
      activeVoiceLocalId: config.qwen.activeVoiceLocalId,
      secretSave: config.qwen.secretSave,
      ...keyFields
    }
  }
}

export function toTtsCloudConfigView(config: TtsCloudConfig): TtsCloudConfigView {
  const apiKey = config.qwen.apiKey.trim()
  const hasApiKey = Boolean(apiKey)
  const secretSave = config.qwen.secretSave === true
  const active = resolveActiveQwenVoice(config)
  const vcModel = config.qwen.vcModel.trim() || DEFAULT_QWEN_VC_MODEL
  const vdModel = config.qwen.vdModel.trim() || DEFAULT_QWEN_VD_MODEL
  return {
    ttsBackend: config.ttsBackend,
    qwen: {
      baseUrl: config.qwen.baseUrl,
      vcModel,
      vdModel,
      voices: config.qwen.voices.map((v) => ({ ...v })),
      activeVoiceLocalId: config.qwen.activeVoiceLocalId,
      activeKind: active?.kind ?? null,
      model: active?.model ?? vcModel,
      voiceId: active?.voiceId ?? '',
      secretSave,
      hasApiKey,
      apiKey: !secretSave && hasApiKey ? apiKey : undefined
    }
  }
}

export function createTtsCloudConfigStore(deps: TtsCloudConfigStoreDeps) {
  const crypto = deps.crypto ?? defaultCrypto

  function persist(config: TtsCloudConfig): void {
    const dir = deps.getUserDataPath()
    mkdirSync(dir, { recursive: true })
    writeFileSync(configPath(dir), `${JSON.stringify(toDiskPayload(config, crypto), null, 2)}\n`, 'utf-8')
  }

  function read(): TtsCloudConfig {
    const dir = deps.getUserDataPath()
    mkdirSync(dir, { recursive: true })
    const filePath = configPath(dir)
    if (!existsSync(filePath)) {
      const initial = createDefaultTtsCloudConfig()
      persist(initial)
      return initial
    }
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as TtsCloudConfigDisk
      const { config, shouldRewrite } = normalizeDisk(parsed, crypto)
      if (shouldRewrite) persist(config)
      return config
    } catch {
      const initial = createDefaultTtsCloudConfig()
      persist(initial)
      return initial
    }
  }

  function writePatch(patch: TtsCloudConfigPatch): TtsCloudConfig {
    const current = read()
    const next: TtsCloudConfig = {
      ttsBackend: patch.ttsBackend !== undefined ? asBackend(patch.ttsBackend) : current.ttsBackend,
      qwen: {
        ...current.qwen,
        voices: current.qwen.voices.map((v) => ({ ...v }))
      }
    }
    if (patch.qwen) {
      if (typeof patch.qwen.baseUrl === 'string') {
        next.qwen.baseUrl = patch.qwen.baseUrl.trim() || DEFAULT_QWEN_BASE_URL
      }
      if (typeof patch.qwen.vcModel === 'string') {
        next.qwen.vcModel = patch.qwen.vcModel.trim() || DEFAULT_QWEN_VC_MODEL
      }
      if (typeof patch.qwen.vdModel === 'string') {
        next.qwen.vdModel = patch.qwen.vdModel.trim() || DEFAULT_QWEN_VD_MODEL
      }
      // 兼容旧补丁：model → vcModel（官方克隆绑 VC）
      if (typeof patch.qwen.model === 'string') {
        next.qwen.vcModel = patch.qwen.model.trim() || DEFAULT_QWEN_VC_MODEL
      }
      if (Array.isArray(patch.qwen.voices)) {
        next.qwen.voices = normalizeVoices(patch.qwen.voices)
      }
      if (typeof patch.qwen.activeVoiceLocalId === 'string') {
        next.qwen.activeVoiceLocalId = patch.qwen.activeVoiceLocalId.trim()
      }
      if (typeof patch.qwen.voiceId === 'string') {
        const voiceId = patch.qwen.voiceId.trim()
        if (!voiceId) {
          next.qwen.voices = next.qwen.voices.filter((v) => v.id !== next.qwen.activeVoiceLocalId)
          next.qwen.activeVoiceLocalId = next.qwen.voices[0]?.id ?? ''
        } else {
          upsertOfficialVcVoice(next, voiceId)
        }
      }
      if (typeof patch.qwen.secretSave === 'boolean') {
        next.qwen.secretSave = patch.qwen.secretSave
      }
      if (typeof patch.qwen.apiKey === 'string') {
        next.qwen.apiKey = patch.qwen.apiKey.trim()
      }
    }
    if (
      next.qwen.activeVoiceLocalId &&
      !next.qwen.voices.some((v) => v.id === next.qwen.activeVoiceLocalId)
    ) {
      next.qwen.activeVoiceLocalId = next.qwen.voices[0]?.id ?? ''
    }
    persist(next)
    return next
  }

  return {
    read,
    writePatch,
    getView: () => toTtsCloudConfigView(read())
  }
}

let productionStore: ReturnType<typeof createTtsCloudConfigStore> | null = null

export function getTtsCloudConfigStore(): ReturnType<typeof createTtsCloudConfigStore> {
  if (!productionStore) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron')
    productionStore = createTtsCloudConfigStore({
      getUserDataPath: () => app.getPath('userData')
    })
  }
  return productionStore
}

export { resolveActiveQwenVoice }
