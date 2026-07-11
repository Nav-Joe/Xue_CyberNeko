import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'

import { runtimeDir, voiceForgeSessionFile } from '../paths'
import type { VoiceForgeSession, VoiceForgeSessionPhase } from '../types/runtime-config'

const VALID_PHASES = new Set<VoiceForgeSessionPhase>([
  'pending_restart',
  'generating',
  'awaiting_review',
  'prewarming',
  'completed',
  'cancelled'
])

function parseVoiceForgeSession(raw: unknown): VoiceForgeSession | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  const phase = record.phase
  if (typeof phase !== 'string' || !VALID_PHASES.has(phase as VoiceForgeSessionPhase)) {
    return null
  }
  const flow = record.flow
  if (flow !== null && flow !== 'create_voice') {
    return null
  }
  if (
    typeof record.folderId !== 'string' ||
    typeof record.displayName !== 'string' ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string' ||
    typeof record.version !== 'number'
  ) {
    return null
  }
  const source = record.source
  if (source !== undefined && source !== 'upload' && source !== 'voice_design') {
    return null
  }
  return {
    version: record.version,
    flow: flow as VoiceForgeSession['flow'],
    phase: phase as VoiceForgeSessionPhase,
    folderId: record.folderId,
    displayName: record.displayName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(source !== undefined ? { source } : {})
  }
}

export function readVoiceForgeSession(): VoiceForgeSession | null {
  const sessionPath = voiceForgeSessionFile()
  if (!existsSync(sessionPath)) {
    return null
  }
  try {
    return parseVoiceForgeSession(JSON.parse(readFileSync(sessionPath, 'utf8')))
  } catch {
    return null
  }
}

export function writeVoiceForgeSession(session: VoiceForgeSession): void {
  mkdirSync(runtimeDir(), { recursive: true })
  writeFileSync(voiceForgeSessionFile(), `${JSON.stringify(session, null, 2)}\n`, 'utf8')
}

export function clearVoiceForgeSession(): void {
  const sessionPath = voiceForgeSessionFile()
  if (existsSync(sessionPath)) {
    rmSync(sessionPath, { force: true })
  }
}
