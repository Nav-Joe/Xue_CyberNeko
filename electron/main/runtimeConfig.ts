import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createHash, randomBytes } from 'crypto'

import type { CorpusData } from '../../src/types/corpus'

import { readConfiguredTtsEngine } from './ttsEngineInfo'

export type TouchFeedbackMode = 'curated' | 'custom_corpus' | 'alt_engine_corpus'

export const OFFICIAL_SAMPLE_ID = 'default_sample'
export const OFFICIAL_SAMPLE_LABEL = '默认配置'

export interface VoiceSampleProfile {
  folderId: string
  displayName: string
  kind?: 'official' | 'custom'
  pending?: boolean
}

export interface VoiceSampleEntry {
  folderId: string
  displayName: string
  kind: 'official' | 'custom'
  hasReference: boolean
}

export interface VoiceForgeSession {
  version: number
  flow: 'create_voice' | null
  phase: string
  folderId: string
  displayName: string
  createdAt: string
  updatedAt: string
  source?: 'upload' | 'voice_design'
}

function projectRoot(): string {
  const candidates = [process.cwd(), join(__dirname, '..', '..'), join(__dirname, '..')]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'voice_forge'))) {
      return dir
    }
  }
  return process.cwd()
}

function runtimeDir(): string {
  return join(projectRoot(), '.runtime')
}

function touchModeFile(): string {
  return join(runtimeDir(), 'touch-mode.env')
}

function customCorpusFile(): string {
  return join(runtimeDir(), 'corpus.custom.json')
}

function voiceForgeRoot(): string {
  return join(projectRoot(), 'voice_forge')
}

function customSampleRoot(): string {
  return join(voiceForgeRoot(), 'custom_sample')
}

function defaultSampleDir(): string {
  return join(voiceForgeRoot(), 'default_sample')
}

function sampleDirForId(folderId: string): string {
  if (folderId === OFFICIAL_SAMPLE_ID) {
    return defaultSampleDir()
  }
  return join(customSampleRoot(), folderId)
}

const TOUCH_CACHE_DIR_NAME = 'touch_cache'
const TOUCH_CACHE_POINTER_NAME = 'touch_cache.json'
const CORPUS_SNAPSHOT_NAME = 'corpus.snapshot.json'
const ALT_ENGINE_PREWARM_TARGET = '__alt_engine__'

function writeCorpusSnapshotForSample(sampleDir: string, corpus: CorpusData): void {
  mkdirSync(sampleDir, { recursive: true })
  writeFileSync(
    join(sampleDir, CORPUS_SNAPSHOT_NAME),
    `${JSON.stringify(corpus, null, 2)}\n`,
    'utf8'
  )
}

function altEngineCacheRoot(engine?: string): string {
  const name = (engine ?? readConfiguredTtsEngine()).trim() || 'unknown'
  return join(voiceForgeRoot(), 'other_custom_cache', name)
}

/** 读取第三方引擎语料快照（other_custom_cache/{engine}/corpus.snapshot.json）。 */
function readAltEngineCorpus(engine?: string): CorpusData {
  const snapshotPath = join(altEngineCacheRoot(engine), CORPUS_SNAPSHOT_NAME)
  if (existsSync(snapshotPath)) {
    try {
      return normalizeCorpusPayload(JSON.parse(readFileSync(snapshotPath, 'utf8')))
    } catch {
      // fall through
    }
  }
  return readTouchConfig().corpus
}

function normalizeCorpusPayload(raw: unknown): CorpusData {
  const fallback = JSON.parse(readFileSync(defaultCorpusFile(), 'utf8')) as CorpusData
  if (!raw || typeof raw !== 'object') {
    return fallback
  }
  const parts: Array<keyof CorpusData> = ['head', 'arms', 'body', 'legs', 'tail']
  const result = {} as CorpusData
  for (const part of parts) {
    const value = (raw as Record<string, unknown>)[part]
    if (Array.isArray(value)) {
      result[part] = value
        .filter((line): line is string => typeof line === 'string')
        .map((line) => line.trim())
        .filter(Boolean)
    } else {
      result[part] = [...(fallback[part] ?? [])]
    }
  }
  return result
}

/** 读取某条声线目录下的语料快照；若无快照则返回内置默认语料。 */
export function readSampleCorpus(folderId: string): CorpusData {
  const sampleDir = sampleDirForId(folderId)
  const snapshotPath = join(sampleDir, CORPUS_SNAPSHOT_NAME)
  if (existsSync(snapshotPath)) {
    try {
      return normalizeCorpusPayload(JSON.parse(readFileSync(snapshotPath, 'utf8')))
    } catch {
      // fall through
    }
  }
  return normalizeCorpusPayload(JSON.parse(readFileSync(defaultCorpusFile(), 'utf8')))
}

function clearSampleTouchCache(sampleDir: string): void {
  const cacheDir = join(sampleDir, TOUCH_CACHE_DIR_NAME)
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true })
  }
  const pointer = join(sampleDir, TOUCH_CACHE_POINTER_NAME)
  if (existsSync(pointer)) {
    rmSync(pointer, { force: true })
  }
}

function regenerateVoiceModelFlagFile(): string {
  return join(runtimeDir(), 'regenerate-voice-model.flag')
}

function corpusPrewarmFlagFile(): string {
  return join(runtimeDir(), 'corpus-prewarm.flag')
}

function realtimeInferenceFlagFile(): string {
  return join(runtimeDir(), 'realtime-inference.env')
}

function experimentalVoiceUploadFile(): string {
  return join(runtimeDir(), 'experimental-voice-upload.json')
}

export function readExperimentalVoiceUploadEnabled(): boolean {
  const filePath = experimentalVoiceUploadFile()
  if (!existsSync(filePath)) {
    return false
  }
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8')) as { enabled?: boolean }
    return data.enabled === true
  } catch {
    return false
  }
}

export function writeExperimentalVoiceUploadEnabled(enabled: boolean): void {
  mkdirSync(runtimeDir(), { recursive: true })
  writeFileSync(experimentalVoiceUploadFile(), `${JSON.stringify({ enabled }, null, 2)}\n`, 'utf8')
}

/** 每次启动应用时重置实验功能开关（会话内仍可手动开启）。 */
export function resetExperimentalFeaturesOnStartup(): void {
  writeExperimentalVoiceUploadEnabled(false)
}

const UPLOAD_VOICE_PLACEHOLDER_INSTRUCT = '（用户上传参考音，未使用 VoiceDesign 提示词）'
const MAX_UPLOAD_WAV_BYTES = 15 * 1024 * 1024

function readWavSampleRate(buffer: Buffer): number {
  if (buffer.length < 44) {
    throw new Error('WAV 文件过短或已损坏')
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('请选择有效的 WAV 文件')
  }
  if (buffer.length > MAX_UPLOAD_WAV_BYTES) {
    throw new Error('WAV 文件不能超过 15MB')
  }
  return buffer.readUInt32LE(24)
}

function writeRealtimeInferenceFlag(enabled: boolean): void {
  mkdirSync(runtimeDir(), { recursive: true })
  if (enabled) {
    writeFileSync(realtimeInferenceFlagFile(), '1\n', 'utf8')
  } else if (existsSync(realtimeInferenceFlagFile())) {
    rmSync(realtimeInferenceFlagFile(), { force: true })
  }
}

export function readRealtimeInferenceFlag(): boolean {
  const flagPath = realtimeInferenceFlagFile()
  if (!existsSync(flagPath)) {
    return false
  }
  return readFileSync(flagPath, 'utf8').trim() === '1'
}

function markCorpusPrewarmPending(folderId: string): void {
  const normalized = folderId.trim()
  if (!normalized) {
    throw new Error('语料预热目标声线无效')
  }
  mkdirSync(runtimeDir(), { recursive: true })
  writeFileSync(corpusPrewarmFlagFile(), `${normalized}\n`, 'utf8')
}

function voiceForgeFile(): string {
  return join(runtimeDir(), 'voice-forge.json')
}

function voiceForgeSessionFile(): string {
  return join(runtimeDir(), 'voice-forge-session.json')
}

function qwenConfigFile(): string {
  return join(projectRoot(), 'tts_voice', 'qwen_config.json')
}

function defaultCorpusFile(): string {
  return join(projectRoot(), 'src', 'data', 'corpus.json')
}

function normalizeTouchMode(raw: string | undefined): TouchFeedbackMode {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === 'alt_engine_corpus' || value === 'alt_engine' || value === 'alt-corpus') {
    return 'alt_engine_corpus'
  }
  if (value === 'custom_corpus' || value === 'custom' || value === 'corpus') {
    return 'custom_corpus'
  }
  return 'curated'
}

function sanitizeDisplayName(raw: string): string {
  return raw.trim().replace(/[<>:"/\\|?*]/g, '').slice(0, 32).trim()
}

function readProfileDisplayName(sampleDir: string, fallback: string): string {
  const profilePath = join(sampleDir, 'profile.json')
  if (!existsSync(profilePath)) {
    return fallback
  }
  try {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as { displayName?: string }
    if (typeof profile.displayName === 'string' && profile.displayName.trim()) {
      return profile.displayName.trim()
    }
  } catch {
    // ignore
  }
  return fallback
}

function sampleHasReference(sampleDir: string): boolean {
  return existsSync(join(sampleDir, 'reference.wav'))
}

export function isOfficialSampleProfile(profile: VoiceSampleProfile | null | undefined): boolean {
  if (!profile) {
    return true
  }
  return profile.folderId === OFFICIAL_SAMPLE_ID || profile.kind === 'official'
}

function readOfficialUseCuratedClips(data: Record<string, unknown>): boolean {
  if (typeof data.officialUseCuratedClips === 'boolean') {
    return data.officialUseCuratedClips
  }
  return true
}

function touchModeForOfficialSample(data: Record<string, unknown>): TouchFeedbackMode {
  return readOfficialUseCuratedClips(data) ? 'curated' : 'custom_corpus'
}

export function isOfficialTouchCacheReady(): boolean {
  const sampleDir = defaultSampleDir()
  const pointerPath = join(sampleDir, TOUCH_CACHE_POINTER_NAME)
  if (existsSync(pointerPath)) {
    try {
      const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { ready?: boolean }
      if (pointer.ready === true) {
        return true
      }
    } catch {
      // fall through
    }
  }

  const cacheDir = join(sampleDir, TOUCH_CACHE_DIR_NAME)
  const manifestPath = join(cacheDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    return false
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      entries?: Record<string, { key?: string }>
    }
    const entries = manifest.entries
    if (!entries) {
      return false
    }
    for (const entry of Object.values(entries)) {
      const key = entry?.key?.trim()
      if (!key) {
        continue
      }
      if (existsSync(join(cacheDir, key, '0.wav'))) {
        return true
      }
    }
  } catch {
    return false
  }
  return false
}

export function generateSampleFolderId(): string {
  return `vf_${randomBytes(4).toString('hex')}`
}

export function listVoiceSamples(): VoiceSampleEntry[] {
  const items: VoiceSampleEntry[] = []
  const officialDir = defaultSampleDir()
  if (sampleHasReference(officialDir)) {
    items.push({
      folderId: OFFICIAL_SAMPLE_ID,
      displayName: OFFICIAL_SAMPLE_LABEL,
      kind: 'official',
      hasReference: true
    })
  }

  const customRoot = customSampleRoot()
  if (existsSync(customRoot)) {
    for (const name of readdirSync(customRoot)) {
      const dirPath = join(customRoot, name)
      if (!statSync(dirPath).isDirectory()) {
        continue
      }
      if (!sampleHasReference(dirPath)) {
        continue
      }
      items.push({
        folderId: name,
        displayName: readProfileDisplayName(dirPath, name),
        kind: 'custom',
        hasReference: true
      })
    }
  }

  return items
}

export function readTouchConfig(): { mode: TouchFeedbackMode; corpus: CorpusData } {
  let mode: TouchFeedbackMode = 'curated'
  const modePath = touchModeFile()
  if (existsSync(modePath)) {
    mode = normalizeTouchMode(readFileSync(modePath, 'utf8').split('\n')[0])
  }

  const corpusPath = existsSync(customCorpusFile()) ? customCorpusFile() : defaultCorpusFile()
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as CorpusData
  return { mode, corpus }
}

function readDefaultInstruct(): string {
  if (!existsSync(qwenConfigFile())) {
    return ''
  }
  const data = JSON.parse(readFileSync(qwenConfigFile(), 'utf8')) as { instruct?: string }
  return typeof data.instruct === 'string' ? data.instruct : ''
}

function readSampleInstruct(sampleDir: string): string | null {
  const profilePath = join(sampleDir, 'profile.json')
  if (!existsSync(profilePath)) {
    return null
  }
  try {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as { instruct?: string }
    if (typeof profile.instruct === 'string' && profile.instruct.trim()) {
      return profile.instruct.trim()
    }
  } catch {
    // ignore
  }
  return null
}

function writeSampleInstruct(sampleDir: string, instruct: string): void {
  const trimmed = instruct.trim()
  if (!trimmed) {
    return
  }
  const profilePath = join(sampleDir, 'profile.json')
  let profile: Record<string, unknown> = {}
  if (existsSync(profilePath)) {
    try {
      profile = JSON.parse(readFileSync(profilePath, 'utf8')) as Record<string, unknown>
    } catch {
      profile = {}
    }
  }
  profile.instruct = trimmed
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
}

function resolveInstructForSample(profile: VoiceSampleProfile, config: Record<string, unknown>): string {
  if (isOfficialSampleProfile(profile)) {
    return readDefaultInstruct()
  }
  const fromProfile = readSampleInstruct(sampleDirForId(profile.folderId))
  if (fromProfile) {
    return fromProfile
  }
  const raw = config.instruct
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim()
  }
  return readDefaultInstruct()
}

function preserveCustomInstructFromConfig(
  previousActive: VoiceSampleProfile | null | undefined,
  config: Record<string, unknown>
): void {
  if (!previousActive || isOfficialSampleProfile(previousActive)) {
    return
  }
  const raw = config.instruct
  if (typeof raw !== 'string' || !raw.trim()) {
    return
  }
  const official = readDefaultInstruct().trim()
  if (raw.trim() === official) {
    return
  }
  writeSampleInstruct(sampleDirForId(previousActive.folderId), raw.trim())
}

function readVoiceForgeJson(): Record<string, unknown> {
  if (!existsSync(voiceForgeFile())) {
    return {}
  }
  try {
    return JSON.parse(readFileSync(voiceForgeFile(), 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function readVoiceForgeConfig(): {
  mode: TouchFeedbackMode
  corpus: CorpusData
  instruct: string
  activeSample: VoiceSampleProfile | null
  officialUseCuratedClips: boolean
} {
  const { mode } = readTouchConfig()
  const data = readVoiceForgeJson()
  const instructRaw = data.instruct
  let instruct =
    typeof instructRaw === 'string' && instructRaw.trim() ? instructRaw.trim() : readDefaultInstruct()
  const activeRaw = data.activeSample
  const activeSample =
    activeRaw &&
    typeof activeRaw === 'object' &&
    typeof (activeRaw as VoiceSampleProfile).folderId === 'string' &&
    typeof (activeRaw as VoiceSampleProfile).displayName === 'string'
      ? (activeRaw as VoiceSampleProfile)
      : null

  if (activeSample) {
    instruct = resolveInstructForSample(activeSample, data)
  }

  const corpus =
    mode === 'alt_engine_corpus'
      ? readAltEngineCorpus()
      : activeSample?.folderId?.trim()
        ? readSampleCorpus(activeSample.folderId)
        : readTouchConfig().corpus

  return {
    mode,
    corpus,
    instruct,
    activeSample,
    officialUseCuratedClips: readOfficialUseCuratedClips(data)
  }
}

/** 修复触摸模式与激活声线不一致及中断的会话。 */
export function reconcileVoiceRuntimeConfig(): TouchFeedbackMode {
  const { corpus } = readTouchConfig()
  let { mode, instruct, activeSample } = readVoiceForgeConfig()
  const data = readVoiceForgeJson()

  const sessionPath = voiceForgeSessionFile()
  const clearSession = (): void => {
    if (existsSync(sessionPath)) {
      rmSync(sessionPath, { force: true })
    }
  }

  if (existsSync(sessionPath)) {
    try {
      const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as VoiceForgeSession
      if (session.flow === 'create_voice' && session.phase === 'cancelled') {
        return cancelVoiceForgeReview().touchMode
      }
    } catch {
      clearSession()
    }
  }

  if (
    activeSample &&
    !isOfficialSampleProfile(activeSample) &&
    activeSample.pending === true &&
    mode === 'curated'
  ) {
    return cancelVoiceForgeReview().touchMode
  }

  if (mode === 'alt_engine_corpus' && readConfiguredTtsEngine() === 'qwen') {
    writeTouchConfig('curated', corpus)
    return 'curated'
  }

  if (mode === 'alt_engine_corpus') {
    return mode
  }

  if (mode === 'custom_corpus') {
    const folderId = activeSample?.folderId?.trim() ?? ''
    const sampleDir = folderId ? sampleDirForId(folderId) : defaultSampleDir()
    const referenceReady = sampleHasReference(sampleDir)

    if (!folderId || !referenceReady) {
      mode = 'curated'
      writeTouchConfig('curated', corpus)
      if (folderId && folderId !== OFFICIAL_SAMPLE_ID) {
        const orphanDir = sampleDirForId(folderId)
        if (existsSync(orphanDir)) {
          rmSync(orphanDir, { recursive: true, force: true })
        }
      }
      writeVoiceForgeConfig(
        'curated',
        corpus,
        instruct,
        {
          folderId: OFFICIAL_SAMPLE_ID,
          displayName: OFFICIAL_SAMPLE_LABEL,
          kind: 'official',
          pending: false
        },
        { officialUseCuratedClips: true }
      )
      clearSession()
      return mode
    }

    if (isOfficialSampleProfile(activeSample) && readOfficialUseCuratedClips(data)) {
      mode = 'curated'
      writeTouchConfig('curated', corpus)
      writeVoiceForgeConfig('curated', corpus, instruct, activeSample, { officialUseCuratedClips: true })
      return mode
    }

    return mode
  }

  if (isOfficialSampleProfile(activeSample) && !readOfficialUseCuratedClips(data)) {
    if (isOfficialTouchCacheReady()) {
      mode = 'custom_corpus'
      writeTouchConfig('custom_corpus', corpus)
    }
    return mode
  }

  if (existsSync(sessionPath)) {
    try {
      const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as VoiceForgeSession
      if (
        session.flow === 'create_voice' &&
        session.phase !== 'awaiting_review' &&
        session.phase !== 'pending_restart'
      ) {
        clearSession()
      }
    } catch {
      clearSession()
    }
  }

  return mode
}

export function writeTouchConfig(mode: TouchFeedbackMode, corpus: CorpusData): void {
  mkdirSync(runtimeDir(), { recursive: true })
  writeFileSync(touchModeFile(), `${mode}\n`, 'utf8')
  writeFileSync(customCorpusFile(), `${JSON.stringify(corpus, null, 2)}\n`, 'utf8')
}

export function writeVoiceForgeConfig(
  mode: TouchFeedbackMode,
  corpus: CorpusData,
  instruct: string,
  sampleProfile?: VoiceSampleProfile,
  options?: { officialUseCuratedClips?: boolean }
): void {
  mkdirSync(runtimeDir(), { recursive: true })

  const existing = readVoiceForgeJson()
  const payload: Record<string, unknown> = {
    instruct: instruct.trim()
  }

  if (sampleProfile) {
    payload.activeSample = {
      folderId: sampleProfile.folderId,
      displayName: sampleProfile.displayName,
      kind: sampleProfile.kind ?? (sampleProfile.folderId === OFFICIAL_SAMPLE_ID ? 'official' : 'custom'),
      pending: sampleProfile.pending ?? false
    }
  }

  if (options?.officialUseCuratedClips !== undefined) {
    payload.officialUseCuratedClips = options.officialUseCuratedClips
  } else if (typeof existing.officialUseCuratedClips === 'boolean') {
    payload.officialUseCuratedClips = existing.officialUseCuratedClips
  } else if (sampleProfile && isOfficialSampleProfile(sampleProfile)) {
    payload.officialUseCuratedClips = mode === 'curated'
  }

  // 先写 voice-forge.json（含 officialUseCuratedClips），再写 touch-mode.env，
  // 避免 TTS reconcile 读到 custom_corpus + officialUseCuratedClips=true 的组合。
  writeFileSync(voiceForgeFile(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  writeTouchConfig(mode, corpus)
}

export function switchVoiceSample(folderId: string): VoiceSampleProfile & { touchMode: TouchFeedbackMode } {
  const target = listVoiceSamples().find((item) => item.folderId === folderId)
  if (!target) {
    throw new Error('未找到该音色样本')
  }
  if (!target.hasReference) {
    throw new Error('该音色尚未生成参考音频，请先在音色工坊完成创建')
  }

  const corpus = readSampleCorpus(folderId)
  const config = readVoiceForgeJson()
  const previousActive =
    config.activeSample &&
    typeof config.activeSample === 'object' &&
    typeof (config.activeSample as VoiceSampleProfile).folderId === 'string'
      ? (config.activeSample as VoiceSampleProfile)
      : null
  const profile: VoiceSampleProfile = {
    folderId: target.folderId,
    displayName: target.displayName,
    kind: target.kind,
    pending: false
  }
  const instruct = resolveInstructForSample(profile, config)

  const data = readVoiceForgeJson()
  const touchMode: TouchFeedbackMode =
    target.folderId === OFFICIAL_SAMPLE_ID || target.kind === 'official'
      ? touchModeForOfficialSample(data)
      : 'custom_corpus'

  if (isOfficialSampleProfile(profile)) {
    preserveCustomInstructFromConfig(previousActive, config)
  }

  writeVoiceForgeConfig(touchMode, corpus, instruct, profile, {
    officialUseCuratedClips: touchMode === 'curated'
  })

  if (touchMode === 'curated') {
    writeRealtimeInferenceFlag(false)
  }

  if (!isOfficialSampleProfile(profile)) {
    writeSampleInstruct(sampleDirForId(profile.folderId), instruct)
  }

  const sessionPath = voiceForgeSessionFile()
  if (existsSync(sessionPath)) {
    rmSync(sessionPath, { force: true })
  }

  const regenFlag = regenerateVoiceModelFlagFile()
  if (existsSync(regenFlag)) {
    rmSync(regenFlag, { force: true })
  }

  return { ...profile, touchMode }
}

export function deleteVoiceSample(folderId: string): {
  ok: boolean
  wasActive: boolean
  touchMode: TouchFeedbackMode
} {
  const normalizedId = folderId.trim()
  if (!normalizedId || normalizedId === OFFICIAL_SAMPLE_ID) {
    throw new Error('无法删除官方默认配置')
  }

  const target = listVoiceSamples().find((item) => item.folderId === normalizedId)
  if (!target) {
    throw new Error('未找到该音色样本')
  }
  if (target.kind === 'official') {
    throw new Error('无法删除官方默认配置')
  }

  const sampleDir = sampleDirForId(normalizedId)
  if (!existsSync(sampleDir)) {
    throw new Error('该音色目录不存在或已被删除')
  }

  const config = readVoiceForgeConfig()
  const wasActive = config.activeSample?.folderId === normalizedId

  rmSync(sampleDir, { recursive: true, force: true })

  const sessionPath = voiceForgeSessionFile()
  if (existsSync(sessionPath)) {
    rmSync(sessionPath, { force: true })
  }

  const regenFlag = regenerateVoiceModelFlagFile()
  if (existsSync(regenFlag)) {
    rmSync(regenFlag, { force: true })
  }

  if (wasActive) {
    const { corpus } = readTouchConfig()
    const instruct = config.instruct
    writeVoiceForgeConfig('curated', corpus, instruct, {
      folderId: OFFICIAL_SAMPLE_ID,
      displayName: OFFICIAL_SAMPLE_LABEL,
      kind: 'official',
      pending: false
    }, { officialUseCuratedClips: true })
    return { ok: true, wasActive: true, touchMode: 'curated' }
  }

  return { ok: true, wasActive: false, touchMode: config.mode }
}

/** 试听阶段用户选择「跳过」：删除未完成声线并恢复官方默认配置。 */
export function cancelVoiceForgeReview(): {
  ok: boolean
  removedFolderId: string | null
  touchMode: TouchFeedbackMode
} {
  let folderId: string | null = null

  const sessionPath = voiceForgeSessionFile()
  if (existsSync(sessionPath)) {
    try {
      const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as VoiceForgeSession
      if (session.flow === 'create_voice' && typeof session.folderId === 'string') {
        folderId = session.folderId.trim() || null
      }
    } catch {
      // ignore malformed session
    }
  }

  const config = readVoiceForgeConfig()
  const active = config.activeSample
  if (
    !folderId &&
    active &&
    !isOfficialSampleProfile(active) &&
    typeof active.folderId === 'string'
  ) {
    folderId = active.folderId.trim() || null
  }

  if (folderId && folderId !== OFFICIAL_SAMPLE_ID) {
    const sampleDir = sampleDirForId(folderId)
    if (existsSync(sampleDir)) {
      rmSync(sampleDir, { recursive: true, force: true })
    }
  }

  if (existsSync(sessionPath)) {
    rmSync(sessionPath, { force: true })
  }

  const regenFlag = regenerateVoiceModelFlagFile()
  if (existsSync(regenFlag)) {
    rmSync(regenFlag, { force: true })
  }

  const { corpus } = readTouchConfig()
  writeVoiceForgeConfig(
    'curated',
    corpus,
    config.instruct,
    {
      folderId: OFFICIAL_SAMPLE_ID,
      displayName: OFFICIAL_SAMPLE_LABEL,
      kind: 'official',
      pending: false
    },
    { officialUseCuratedClips: true }
  )
  writeRealtimeInferenceFlag(false)

  return { ok: true, removedFolderId: folderId, touchMode: 'curated' }
}

export type CorpusPrewarmResult = VoiceSampleProfile & {
  /** 未切换当前桌宠使用的激活声线/触摸模式（仅更新目标目录语料快照） */
  runtimeUnchanged: boolean
  touchMode: TouchFeedbackMode
}

/** 保存语料并预热；若目标不是当前激活声线，则不切换运行时配置。 */
export function applyCorpusPrewarm(folderId: string, corpus: CorpusData): CorpusPrewarmResult {
  const target = listVoiceSamples().find((item) => item.folderId === folderId)
  if (!target) {
    throw new Error('未找到该音色样本')
  }
  if (!target.hasReference) {
    throw new Error('该音色尚未生成参考音频，请先在音色工坊完成创建')
  }

  const config = readVoiceForgeJson()
  const previousActive =
    config.activeSample &&
    typeof config.activeSample === 'object' &&
    typeof (config.activeSample as VoiceSampleProfile).folderId === 'string'
      ? (config.activeSample as VoiceSampleProfile)
      : null
  const profile: VoiceSampleProfile = {
    folderId: target.folderId,
    displayName: target.displayName,
    kind:
      target.folderId === OFFICIAL_SAMPLE_ID || target.kind === 'official' ? 'official' : 'custom',
    pending: false
  }
  const instruct = resolveInstructForSample(profile, config)
  const isActiveTarget = previousActive?.folderId === profile.folderId
  const currentTouchMode = readTouchConfig().mode

  const sampleDir = sampleDirForId(target.folderId)
  writeCorpusSnapshotForSample(sampleDir, corpus)
  // 增量预热由 TTS 对比 manifest 逐句处理，不再整库清空 touch_cache。

  if (isOfficialSampleProfile(profile)) {
    preserveCustomInstructFromConfig(previousActive, config)
  } else {
    writeSampleInstruct(sampleDir, instruct)
  }

  if (isActiveTarget) {
    // 正在使用的声线：同步全局配置并预热该声线缓存
    writeVoiceForgeConfig('custom_corpus', corpus, instruct, profile, {
      officialUseCuratedClips: false
    })
  }

  markCorpusPrewarmPending(profile.folderId)

  const sessionPath = voiceForgeSessionFile()
  if (existsSync(sessionPath)) {
    rmSync(sessionPath, { force: true })
  }

  const regenFlag = regenerateVoiceModelFlagFile()
  if (existsSync(regenFlag)) {
    rmSync(regenFlag, { force: true })
  }

  return {
    ...profile,
    runtimeUnchanged: !isActiveTarget,
    touchMode: isActiveTarget ? 'custom_corpus' : currentTouchMode
  }
}

/** 非 Qwen 引擎：保存语料并预热到 voice_forge/other_custom_cache/{engine}/ */
export function applyAltEngineCorpus(corpus: CorpusData): {
  ok: true
  mode: 'alt_engine_corpus'
  engine: string
} {
  const engine = readConfiguredTtsEngine()
  if (engine === 'qwen') {
    throw new Error('Qwen 引擎请使用音色工坊管理语料')
  }

  const cacheRoot = join(voiceForgeRoot(), 'other_custom_cache', engine)
  mkdirSync(cacheRoot, { recursive: true })
  writeFileSync(join(cacheRoot, CORPUS_SNAPSHOT_NAME), `${JSON.stringify(corpus, null, 2)}\n`, 'utf8')
  writeFileSync(customCorpusFile(), `${JSON.stringify(corpus, null, 2)}\n`, 'utf8')
  writeFileSync(touchModeFile(), 'alt_engine_corpus\n', 'utf8')

  writeVoiceForgeConfig(
    'alt_engine_corpus',
    corpus,
    readDefaultInstruct(),
    {
      folderId: OFFICIAL_SAMPLE_ID,
      displayName: OFFICIAL_SAMPLE_LABEL,
      kind: 'official',
      pending: false
    },
    { officialUseCuratedClips: false }
  )

  markCorpusPrewarmPending(ALT_ENGINE_PREWARM_TARGET)
  return { ok: true, mode: 'alt_engine_corpus', engine }
}

export function disableAltEngineCorpus(): { touchMode: 'curated' } {
  const { corpus } = readTouchConfig()
  writeTouchConfig('curated', corpus)
  writeVoiceForgeConfig(
    'curated',
    corpus,
    readDefaultInstruct(),
    {
      folderId: OFFICIAL_SAMPLE_ID,
      displayName: OFFICIAL_SAMPLE_LABEL,
      kind: 'official',
      pending: false
    },
    { officialUseCuratedClips: true }
  )
  writeRealtimeInferenceFlag(false)
  return { touchMode: 'curated' }
}

export function setOfficialTouchPlayback(useCuratedClips: boolean): {
  touchMode: TouchFeedbackMode
  officialUseCuratedClips: boolean
} {
  const config = readVoiceForgeConfig()
  if (!isOfficialSampleProfile(config.activeSample)) {
    throw new Error('仅在使用官方默认声线时可切换触摸音频来源')
  }

  if (!useCuratedClips && !isOfficialTouchCacheReady()) {
    throw new Error('官方语料预热缓存为空，请先在音色工坊「更新语料库」中选择「默认配置」并保存预热。')
  }

  const profile: VoiceSampleProfile = {
    folderId: config.activeSample!.folderId,
    displayName: config.activeSample!.displayName,
    kind: 'official',
    pending: false
  }
  const touchMode: TouchFeedbackMode = useCuratedClips ? 'curated' : 'custom_corpus'

  writeVoiceForgeConfig(touchMode, config.corpus, config.instruct, profile, {
    officialUseCuratedClips: useCuratedClips
  })

  if (useCuratedClips) {
    writeRealtimeInferenceFlag(false)
  }

  const sessionPath = voiceForgeSessionFile()
  if (existsSync(sessionPath)) {
    rmSync(sessionPath, { force: true })
  }

  const regenFlag = regenerateVoiceModelFlagFile()
  if (existsSync(regenFlag)) {
    rmSync(regenFlag, { force: true })
  }

  return { touchMode, officialUseCuratedClips: useCuratedClips }
}

/** 开启/关闭触摸实时推理；开启时会切到语料 TTS 并加载当前激活声线的克隆引擎。 */
export function setRealtimeTouchInference(enabled: boolean): {
  enabled: boolean
  touchMode: TouchFeedbackMode
  officialUseCuratedClips: boolean
  activeSampleName: string | null
  activeSampleKind: 'official' | 'custom' | null
} {
  writeRealtimeInferenceFlag(enabled)

  const config = readVoiceForgeConfig()

  if (enabled && config.mode === 'alt_engine_corpus') {
    return {
      enabled: true,
      touchMode: 'alt_engine_corpus',
      officialUseCuratedClips: false,
      activeSampleName: `第三方引擎 (${readConfiguredTtsEngine()})`,
      activeSampleKind: null
    }
  }

  if (!enabled) {
    return {
      enabled: false,
      touchMode: config.mode,
      officialUseCuratedClips: config.officialUseCuratedClips,
      activeSampleName: config.activeSample?.displayName ?? null,
      activeSampleKind:
        config.activeSample?.kind ??
        (config.activeSample && isOfficialSampleProfile(config.activeSample) ? 'official' : 'custom') ??
        null
    }
  }

  const active = config.activeSample
  if (!active?.folderId?.trim()) {
    writeRealtimeInferenceFlag(false)
    throw new Error('请先在回家窗口选择要使用的声线')
  }

  const sampleDir = sampleDirForId(active.folderId)
  if (!sampleHasReference(sampleDir)) {
    writeRealtimeInferenceFlag(false)
    throw new Error('当前声线尚未就绪，无法启用实时推理')
  }

  const profile: VoiceSampleProfile = {
    folderId: active.folderId,
    displayName: active.displayName,
    kind: isOfficialSampleProfile(active) ? 'official' : 'custom',
    pending: false
  }
  const corpus = readSampleCorpus(active.folderId)
  const instruct = resolveInstructForSample(profile, readVoiceForgeJson())

  writeVoiceForgeConfig('custom_corpus', corpus, instruct, profile, {
    officialUseCuratedClips: false
  })
  markCorpusPrewarmPending(profile.folderId)

  const sessionPath = voiceForgeSessionFile()
  if (existsSync(sessionPath)) {
    rmSync(sessionPath, { force: true })
  }

  return {
    enabled: true,
    touchMode: 'custom_corpus',
    officialUseCuratedClips: false,
    activeSampleName: active.displayName,
    activeSampleKind: profile.kind ?? 'custom'
  }
}

export function prepareVoiceCreation(
  mode: TouchFeedbackMode,
  corpus: CorpusData,
  instruct: string,
  displayName: string
): VoiceSampleProfile {
  const folderId = generateSampleFolderId()
  const safeName = sanitizeDisplayName(displayName)
  if (!safeName) {
    throw new Error('声线名称无效')
  }

  const sampleDir = sampleDirForId(folderId)
  mkdirSync(sampleDir, { recursive: true })
  writeFileSync(
    join(sampleDir, 'profile.json'),
    `${JSON.stringify(
      {
        folderId,
        displayName: safeName,
        createdAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  const profile: VoiceSampleProfile = {
    folderId,
    displayName: safeName,
    kind: 'custom',
    pending: true
  }

  writeCorpusSnapshotForSample(sampleDir, corpus)
  writeVoiceForgeConfig(mode, corpus, instruct, profile)

  writeSampleInstruct(sampleDir, instruct)

  const session: VoiceForgeSession = {
    version: 1,
    flow: 'create_voice',
    phase: 'pending_restart',
    folderId,
    displayName: safeName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  writeFileSync(voiceForgeSessionFile(), `${JSON.stringify(session, null, 2)}\n`, 'utf8')

  return profile
}

/** 实验功能：导入用户上传的 WAV 作为克隆参考音，跳过 VoiceDesign，直接进入试听。 */
export function prepareVoiceUpload(
  displayName: string,
  corpus: CorpusData,
  referenceText: string,
  wavBuffer: Buffer
): VoiceSampleProfile {
  const safeName = sanitizeDisplayName(displayName)
  if (!safeName) {
    throw new Error('声线名称无效')
  }
  const text = referenceText.trim()
  if (!text) {
    throw new Error('请填写参考音频原文')
  }
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length === 0) {
    throw new Error('未收到有效的 WAV 数据')
  }

  const sampleRate = readWavSampleRate(wavBuffer)
  const folderId = generateSampleFolderId()
  const sampleDir = sampleDirForId(folderId)
  mkdirSync(sampleDir, { recursive: true })

  writeFileSync(
    join(sampleDir, 'profile.json'),
    `${JSON.stringify(
      {
        folderId,
        displayName: safeName,
        createdAt: new Date().toISOString(),
        instruct: UPLOAD_VOICE_PLACEHOLDER_INSTRUCT
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  writeFileSync(join(sampleDir, 'reference.wav'), wavBuffer)
  writeFileSync(join(sampleDir, 'reference.txt'), `${text}\n`, 'utf8')
  writeFileSync(
    join(sampleDir, 'meta.json'),
    `${JSON.stringify(
      {
        source: 'upload',
        sample_rate: sampleRate,
        language: 'Chinese',
        folderId,
        displayName: safeName,
        fingerprint: createHash('sha256').update(wavBuffer).digest('hex').slice(0, 24),
        uploadedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  const profile: VoiceSampleProfile = {
    folderId,
    displayName: safeName,
    kind: 'custom',
    pending: true
  }

  writeCorpusSnapshotForSample(sampleDir, corpus)
  writeVoiceForgeConfig('custom_corpus', corpus, UPLOAD_VOICE_PLACEHOLDER_INSTRUCT, profile)
  writeSampleInstruct(sampleDir, UPLOAD_VOICE_PLACEHOLDER_INSTRUCT)

  const session: VoiceForgeSession = {
    version: 1,
    flow: 'create_voice',
    phase: 'awaiting_review',
    source: 'upload',
    folderId,
    displayName: safeName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  writeFileSync(voiceForgeSessionFile(), `${JSON.stringify(session, null, 2)}\n`, 'utf8')

  return profile
}

export function requestVoiceModelRegeneration(): void {
  mkdirSync(runtimeDir(), { recursive: true })
  const config = readVoiceForgeConfig()
  const active = config.activeSample
  const folderId = active?.folderId
  if (folderId) {
    const sampleDir = sampleDirForId(folderId)
    for (const name of ['reference.wav', 'reference.txt', 'meta.json']) {
      const filePath = join(sampleDir, name)
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true })
      }
    }

    const session: VoiceForgeSession = {
      version: 1,
      flow: 'create_voice',
      phase: 'pending_restart',
      folderId,
      displayName: active.displayName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    writeFileSync(voiceForgeSessionFile(), `${JSON.stringify(session, null, 2)}\n`, 'utf8')
  }
  writeFileSync(regenerateVoiceModelFlagFile(), '1\n', 'utf8')
}
