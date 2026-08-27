/**
 * 独立配置文件 screen-companion-config.json（不并进聊天配置）。
 * 视觉 API Key 落盘方式与聊天相同：优先系统凭据加密写成 apiKeyEnc。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

import {
  buildDiskApiKeyFields,
  createSafeStorageApiKeyCrypto,
  resolveApiKeyFromDisk,
  type ApiKeyCrypto
} from '../chat/apiKeyAtRest'
import { isChatTtsEnabledForCompanion } from './chatTtsGate'
import type {
  CompanionTtsDevice,
  ScreenCompanionConfig,
  ScreenCompanionConfigView,
  VisionLlmConfig
} from './types'

export const DEFAULT_SCREEN_COMPANION_CONFIG: ScreenCompanionConfig = {
  enabled: false,
  pausedUntilMs: null,
  processBlacklist: [],
  intervalSec: 90,
  companionTtsDevice: 'cpu',
  visionApiKeySecretSave: false,
  vision: {
    baseUrl: '',
    apiKey: '',
    model: ''
  }
}

type DiskVision = {
  baseUrl?: string
  model?: string
  apiKey?: string
  apiKeyEnc?: string
}

type DiskFile = {
  enabled?: boolean
  pausedUntilMs?: number | null
  processBlacklist?: string[]
  intervalSec?: number
  companionTtsDevice?: string
  visionApiKeySecretSave?: boolean
  vision?: DiskVision
}

let cryptoOverride: ApiKeyCrypto | null = null
let pathOverride: string | null = null

/** 单测注入 */
export function setScreenCompanionConfigTestHooks(hooks: {
  crypto?: ApiKeyCrypto | null
  configPath?: string | null
}): void {
  cryptoOverride = hooks.crypto === undefined ? cryptoOverride : hooks.crypto
  pathOverride = hooks.configPath === undefined ? pathOverride : hooks.configPath
}

function getCrypto(): ApiKeyCrypto {
  return cryptoOverride ?? createSafeStorageApiKeyCrypto()
}

export function resolveScreenCompanionConfigPath(): string {
  if (pathOverride) return pathOverride
  // 延迟 require electron，便于 vitest
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  return join(app.getPath('userData'), 'screen-companion-config.json')
}

function normalizeBlacklist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (t) out.push(t)
  }
  return out
}

function normalizePausedUntil(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function normalizeIntervalSec(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 90
  return Math.min(600, Math.max(30, Math.floor(n)))
}

export function normalizeCompanionTtsDevice(raw: unknown): CompanionTtsDevice {
  return raw === 'gpu' ? 'gpu' : 'cpu'
}

export function normalizeScreenCompanionConfig(raw: DiskFile | null | undefined): {
  config: ScreenCompanionConfig
  shouldRewrite: boolean
} {
  const crypto = getCrypto()
  const visionRaw = raw?.vision ?? {}
  const key = resolveApiKeyFromDisk(
    { apiKey: visionRaw.apiKey, apiKeyEnc: visionRaw.apiKeyEnc },
    crypto
  )
  const config: ScreenCompanionConfig = {
    enabled: raw?.enabled === true,
    pausedUntilMs: normalizePausedUntil(raw?.pausedUntilMs),
    processBlacklist: normalizeBlacklist(raw?.processBlacklist),
    intervalSec: normalizeIntervalSec(raw?.intervalSec),
    companionTtsDevice: normalizeCompanionTtsDevice(raw?.companionTtsDevice),
    visionApiKeySecretSave: raw?.visionApiKeySecretSave === true,
    vision: {
      baseUrl: typeof visionRaw.baseUrl === 'string' ? visionRaw.baseUrl.trim() : '',
      model: typeof visionRaw.model === 'string' ? visionRaw.model.trim() : '',
      apiKey: key.plain
    }
  }
  return { config, shouldRewrite: key.shouldRewrite }
}

function toDisk(config: ScreenCompanionConfig): DiskFile {
  const keyFields = buildDiskApiKeyFields(config.vision.apiKey, getCrypto())
  return {
    enabled: config.enabled === true,
    pausedUntilMs: config.pausedUntilMs,
    processBlacklist: [...config.processBlacklist],
    visionApiKeySecretSave: config.visionApiKeySecretSave === true,
    vision: {
      baseUrl: config.vision.baseUrl,
      model: config.vision.model,
      ...keyFields
    },
    intervalSec: normalizeIntervalSec(config.intervalSec),
    companionTtsDevice: normalizeCompanionTtsDevice(config.companionTtsDevice)
  }
}

export function readScreenCompanionConfig(): ScreenCompanionConfig {
  const path = resolveScreenCompanionConfigPath()
  if (!existsSync(path)) {
    writeScreenCompanionConfig(DEFAULT_SCREEN_COMPANION_CONFIG)
    return { ...DEFAULT_SCREEN_COMPANION_CONFIG, vision: { ...DEFAULT_SCREEN_COMPANION_CONFIG.vision } }
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as DiskFile
    const { config, shouldRewrite } = normalizeScreenCompanionConfig(raw)
    if (shouldRewrite) {
      writeScreenCompanionConfig(config)
    }
    return config
  } catch {
    return {
      ...DEFAULT_SCREEN_COMPANION_CONFIG,
      vision: { ...DEFAULT_SCREEN_COMPANION_CONFIG.vision }
    }
  }
}

export function writeScreenCompanionConfig(config: ScreenCompanionConfig): ScreenCompanionConfig {
  const path = resolveScreenCompanionConfigPath()
  mkdirSync(dirname(path), { recursive: true })
  const normalized = normalizeScreenCompanionConfig({
    enabled: config.enabled,
    pausedUntilMs: config.pausedUntilMs,
    processBlacklist: config.processBlacklist,
    intervalSec: config.intervalSec,
    companionTtsDevice: config.companionTtsDevice,
    visionApiKeySecretSave: config.visionApiKeySecretSave,
    vision: {
      baseUrl: config.vision.baseUrl,
      model: config.vision.model,
      apiKey: config.vision.apiKey
    }
  }).config
  writeFileSync(path, JSON.stringify(toDisk(normalized), null, 2) + '\n', 'utf8')
  return normalized
}

export function toScreenCompanionConfigView(config: ScreenCompanionConfig): ScreenCompanionConfigView {
  const apiKey = config.vision.apiKey.trim()
  const hasVisionApiKey = Boolean(apiKey)
  const secretSave = config.visionApiKeySecretSave === true
  return {
    enabled: config.enabled === true,
    pausedUntilMs: config.pausedUntilMs,
    processBlacklist: [...config.processBlacklist],
    intervalSec: normalizeIntervalSec(config.intervalSec),
    companionTtsDevice: normalizeCompanionTtsDevice(config.companionTtsDevice),
    visionBaseUrl: config.vision.baseUrl,
    visionModel: config.vision.model,
    hasVisionApiKey,
    visionApiKeySecretSave: secretSave,
    visionApiKey: !secretSave && hasVisionApiKey ? apiKey : undefined
  }
}

export function isVisionConfigured(vision: VisionLlmConfig): boolean {
  return Boolean(vision.baseUrl.trim() && vision.model.trim() && vision.apiKey.trim())
}

export type ScreenCompanionConfigWritePayload = ScreenCompanionConfigView & {
  /** 若提供则更新 Key；空字符串且 clearVisionApiKey 时清空 */
  visionApiKey?: string
  clearVisionApiKey?: boolean
}

export function applyScreenCompanionConfigWrite(
  current: ScreenCompanionConfig,
  payload: ScreenCompanionConfigWritePayload
): ScreenCompanionConfig {
  if (payload.enabled === true && !isChatTtsEnabledForCompanion()) {
    throw new Error('tts_required')
  }

  let apiKey = current.vision.apiKey
  if (payload.clearVisionApiKey) {
    apiKey = ''
  } else if (typeof payload.visionApiKey === 'string') {
    apiKey = payload.visionApiKey
  }

  return {
    enabled: payload.enabled === true,
    pausedUntilMs: normalizePausedUntil(payload.pausedUntilMs),
    processBlacklist: normalizeBlacklist(payload.processBlacklist),
    intervalSec: normalizeIntervalSec(
      payload.intervalSec !== undefined && payload.intervalSec !== null
        ? payload.intervalSec
        : current.intervalSec
    ),
    companionTtsDevice: normalizeCompanionTtsDevice(
      payload.companionTtsDevice !== undefined
        ? payload.companionTtsDevice
        : current.companionTtsDevice
    ),
    visionApiKeySecretSave:
      payload.visionApiKeySecretSave !== undefined
        ? payload.visionApiKeySecretSave === true
        : current.visionApiKeySecretSave === true,
    vision: {
      baseUrl: typeof payload.visionBaseUrl === 'string' ? payload.visionBaseUrl.trim() : '',
      model: typeof payload.visionModel === 'string' ? payload.visionModel.trim() : '',
      apiKey
    }
  }
}
