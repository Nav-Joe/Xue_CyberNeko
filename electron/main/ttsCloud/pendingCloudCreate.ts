/**
 * 云端创造暂存：VD/VC 已在百炼创建，但未写入 voices 列表，等审阅确认。
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { CorpusData } from '../../../src/types/corpus'
import type { QwenVoiceKind } from './types'

export type CloudPendingCreate = {
  kind: QwenVoiceKind
  displayName: string
  voiceId: string
  /** VD 声音描述；VC 可空 */
  voicePrompt: string
  previewText: string
  corpus: CorpusData
  createdAt: number
}

function pendingDir(userData: string): string {
  return join(userData, 'tts-cloud-pending')
}

function pendingJsonPath(userData: string): string {
  return join(pendingDir(userData), 'pending.json')
}

function pendingPreviewPath(userData: string): string {
  return join(pendingDir(userData), 'preview.wav')
}

export function clearCloudPendingCreate(userData: string): void {
  const dir = pendingDir(userData)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function readCloudPendingCreate(userData: string): CloudPendingCreate | null {
  const path = pendingJsonPath(userData)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as CloudPendingCreate
    if (!raw?.voiceId || !raw?.displayName) return null
    return raw
  } catch {
    return null
  }
}

export function writeCloudPendingCreate(
  userData: string,
  pending: CloudPendingCreate,
  previewAudio?: ArrayBuffer
): void {
  const dir = pendingDir(userData)
  mkdirSync(dir, { recursive: true })
  writeFileSync(pendingJsonPath(userData), `${JSON.stringify(pending, null, 2)}\n`, 'utf8')
  if (previewAudio && previewAudio.byteLength > 0) {
    writeFileSync(pendingPreviewPath(userData), Buffer.from(previewAudio))
  }
}

export function readCloudPendingPreview(
  userData: string
): { ok: true; audio: ArrayBuffer; mime: 'audio/wav' } | { ok: false } {
  const path = pendingPreviewPath(userData)
  if (!existsSync(path)) return { ok: false }
  try {
    const bytes = readFileSync(path)
    if (bytes.byteLength === 0) return { ok: false }
    return {
      ok: true,
      audio: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      mime: 'audio/wav'
    }
  } catch {
    return { ok: false }
  }
}
