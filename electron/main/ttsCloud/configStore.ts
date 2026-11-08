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
import { defaultEdgeFields, normalizeEdgeFields, normalizeEdgeVoices } from './edgeConfig'
import { defaultSeedFields, normalizeSeedFields, normalizeSeedVoices } from './seedConfig'
import {
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_VC_MODEL,
  DEFAULT_QWEN_VD_MODEL,
  DEFAULT_SEED_BASE_URL,
  DEFAULT_SEED_RESOURCE_ID,
  DEFAULT_EDGE_WSS_URL,
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
    },
    seed: defaultSeedFields(),
    edge: defaultEdgeFields()
  }
}

/** qwen / seed 为云端；旧 fish/minimax 回落 local */
function asBackend(raw: unknown): TtsBackend {
  if (raw === 'qwen' || raw === 'seed' || raw === 'edge') return raw
  return 'local'
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

  const seedRaw = raw.seed
  const seedKey = resolveApiKeyFromDisk(
    { apiKey: seedRaw?.apiKey, apiKeyEnc: seedRaw?.apiKeyEnc },
    crypto
  )
  const seed = normalizeSeedFields(seedRaw, seedKey.plain)
  const seedNeedsEncrypt =
    Boolean(seed.apiKey.trim()) &&
    crypto.isAvailable() &&
    !(typeof seedRaw?.apiKeyEnc === 'string' && seedRaw.apiKeyEnc.trim())

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
      },
      seed,
      edge: normalizeEdgeFields(raw.edge)
    },
    shouldRewrite:
      shouldRewrite ||
      needsEncrypt ||
      needsShapeRewrite ||
      hadLegacyVendor ||
      seedKey.shouldRewrite ||
      seedNeedsEncrypt ||
      !raw.seed ||
      !raw.edge
  }
}

function toDiskPayload(config: TtsCloudConfig, crypto: ApiKeyCrypto): Record<string, unknown> {
  const keyFields = buildDiskApiKeyFields(config.qwen.apiKey, crypto)
  const seedKeyFields = buildDiskApiKeyFields(config.seed.apiKey, crypto)
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
    },
    seed: {
      baseUrl: config.seed.baseUrl.trim() || DEFAULT_SEED_BASE_URL,
      resourceId: config.seed.resourceId.trim() || DEFAULT_SEED_RESOURCE_ID,
      voices: config.seed.voices,
      activeVoiceLocalId: config.seed.activeVoiceLocalId,
      secretSave: config.seed.secretSave,
      ...seedKeyFields
    },
    edge: {
      baseUrl: config.edge.baseUrl.trim() || DEFAULT_EDGE_WSS_URL,
      voices: config.edge.voices,
      activeVoiceLocalId: config.edge.activeVoiceLocalId
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
    },
    seed: {
      baseUrl: config.seed.baseUrl,
      resourceId: config.seed.resourceId,
      voices: config.seed.voices.map((voice) => ({ ...voice })),
      activeVoiceLocalId: config.seed.activeVoiceLocalId,
      secretSave: config.seed.secretSave === true,
      hasApiKey: Boolean(config.seed.apiKey.trim()),
      apiKey:
        config.seed.secretSave !== true && config.seed.apiKey.trim()
          ? config.seed.apiKey.trim()
          : undefined
    },
    edge: {
      baseUrl: config.edge.baseUrl,
      voices: config.edge.voices.map((voice) => ({ ...voice })),
      activeVoiceLocalId: config.edge.activeVoiceLocalId
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
      },
      seed: {
        ...current.seed,
        voices: current.seed.voices.map((voice) => ({ ...voice }))
      },
      edge: {
        ...current.edge,
        voices: current.edge.voices.map((voice) => ({ ...voice }))
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
    if (patch.seed) {
      if (typeof patch.seed.baseUrl === 'string') {
        next.seed.baseUrl = patch.seed.baseUrl.trim() || DEFAULT_SEED_BASE_URL
      }
      if (typeof patch.seed.resourceId === 'string') {
        next.seed.resourceId = patch.seed.resourceId.trim() || DEFAULT_SEED_RESOURCE_ID
      }
      if (Array.isArray(patch.seed.voices)) {
        next.seed.voices = normalizeSeedVoices(patch.seed.voices)
      }
      if (typeof patch.seed.activeVoiceLocalId === 'string') {
        next.seed.activeVoiceLocalId = patch.seed.activeVoiceLocalId.trim()
      }
      if (typeof patch.seed.secretSave === 'boolean') {
        next.seed.secretSave = patch.seed.secretSave
      }
      if (typeof patch.seed.apiKey === 'string') {
        next.seed.apiKey = patch.seed.apiKey.trim()
      }
    }
    if (patch.edge) {
      if (typeof patch.edge.baseUrl === 'string') {
        next.edge.baseUrl = patch.edge.baseUrl.trim() || DEFAULT_EDGE_WSS_URL
      }
      if (Array.isArray(patch.edge.voices)) {
        next.edge.voices = normalizeEdgeVoices(patch.edge.voices)
      }
      if (typeof patch.edge.activeVoiceLocalId === 'string') {
        next.edge.activeVoiceLocalId = patch.edge.activeVoiceLocalId.trim()
      }
    }
    if (
      next.qwen.activeVoiceLocalId &&
      !next.qwen.voices.some((v) => v.id === next.qwen.activeVoiceLocalId)
    ) {
      next.qwen.activeVoiceLocalId = next.qwen.voices[0]?.id ?? ''
    }
    if (
      next.seed.activeVoiceLocalId &&
      !next.seed.voices.some((voice) => voice.id === next.seed.activeVoiceLocalId)
    ) {
      next.seed.activeVoiceLocalId = next.seed.voices[0]?.id ?? ''
    }
    if (
      next.edge.activeVoiceLocalId &&
      !next.edge.voices.some((voice) => voice.id === next.edge.activeVoiceLocalId)
    ) {
      next.edge.activeVoiceLocalId = next.edge.voices[0]?.id ?? ''
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
