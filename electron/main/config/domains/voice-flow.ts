import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { CorpusData } from '../../../../src/types/corpus'

import { writeCorpusSnapshotForSample } from '../internal/corpus-utils'
import {
  clearRegenerateVoiceModelFlag,
  writeRealtimeInferenceFlag,
  writeRegenerateVoiceModelFlag
} from '../internal/flags-io'
import {
  clearVoiceForgeSession,
  readVoiceForgeSession,
  writeVoiceForgeSession
} from '../internal/session-io'
import { generateSampleFolderId, sanitizeDisplayName, writeSampleInstruct } from '../internal/sample-utils'
import { runtimeDir, sampleDirForId } from '../paths'
import { readTouchConfig } from './touch'
import {
  isOfficialSampleProfile,
  readVoiceForgeConfig,
  writeVoiceForgeConfig
} from './voice-forge'
import type { TouchFeedbackMode, VoiceForgeSession, VoiceSampleProfile } from '../types/runtime-config'
import { OFFICIAL_SAMPLE_ID, OFFICIAL_SAMPLE_LABEL } from '../types/runtime-config'

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

/** 试听阶段用户选择「跳过」：删除未完成声线并恢复官方默认配置。 */
export function cancelVoiceForgeReview(): {
  ok: boolean
  removedFolderId: string | null
  touchMode: TouchFeedbackMode
} {
  let folderId: string | null = null

  const session = readVoiceForgeSession()
  if (session?.flow === 'create_voice' && typeof session.folderId === 'string') {
    folderId = session.folderId.trim() || null
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

  clearVoiceForgeSession()
  clearRegenerateVoiceModelFlag()

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
  writeVoiceForgeSession(session)

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
  writeVoiceForgeSession(session)

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
    writeVoiceForgeSession(session)
  }
  writeRegenerateVoiceModelFlag()
}
