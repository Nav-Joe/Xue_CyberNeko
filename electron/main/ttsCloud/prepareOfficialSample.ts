/**
 * 官方克隆样本 → 百炼 Qwen-TTS 声音复刻可用的 WAV 字节。
 * 仅处理 PCM16 WAV；不做复杂编解码。
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { defaultSampleDir } from '../config/paths'

export const QWEN_ENROLL_MIN_SECONDS = 3
export const QWEN_ENROLL_MAX_SECONDS = 60
export const QWEN_ENROLL_TARGET_SR = 24_000
export const QWEN_ENROLL_MAX_BYTES = 10 * 1024 * 1024

export type PreparedOfficialSample =
  | {
      ok: true
      wavBytes: Uint8Array
      mime: 'audio/wav'
      referenceText: string
      durationSec: number
      sampleRate: number
    }
  | { ok: false; detail: string }

type PcmWav = {
  channels: number
  sampleRate: number
  bitsPerSample: number
  pcm: Int16Array
}

function readUtf8IfExists(path: string): string {
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf-8').trim()
}

function findChunk(view: DataView, id: string, start: number, end: number): { offset: number; size: number } | null {
  let o = start
  while (o + 8 <= end) {
    const tag =
      String.fromCharCode(view.getUint8(o)) +
      String.fromCharCode(view.getUint8(o + 1)) +
      String.fromCharCode(view.getUint8(o + 2)) +
      String.fromCharCode(view.getUint8(o + 3))
    const size = view.getUint32(o + 4, true)
    if (tag === id) return { offset: o + 8, size }
    o += 8 + size + (size % 2)
  }
  return null
}

export function parsePcm16Wav(bytes: Uint8Array): PcmWav | null {
  if (bytes.byteLength < 44) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const riff =
    String.fromCharCode(view.getUint8(0)) +
    String.fromCharCode(view.getUint8(1)) +
    String.fromCharCode(view.getUint8(2)) +
    String.fromCharCode(view.getUint8(3))
  const wave =
    String.fromCharCode(view.getUint8(8)) +
    String.fromCharCode(view.getUint8(9)) +
    String.fromCharCode(view.getUint8(10)) +
    String.fromCharCode(view.getUint8(11))
  if (riff !== 'RIFF' || wave !== 'WAVE') return null

  const fmt = findChunk(view, 'fmt ', 12, bytes.byteLength)
  const data = findChunk(view, 'data', 12, bytes.byteLength)
  if (!fmt || !data || fmt.size < 16) return null

  const audioFormat = view.getUint16(fmt.offset, true)
  const channels = view.getUint16(fmt.offset + 2, true)
  const sampleRate = view.getUint32(fmt.offset + 4, true)
  const bitsPerSample = view.getUint16(fmt.offset + 14, true)
  if (audioFormat !== 1 || bitsPerSample !== 16 || channels < 1) return null

  const sampleCount = Math.floor(data.size / 2)
  const pcm = new Int16Array(sampleCount)
  for (let i = 0; i < sampleCount; i += 1) {
    pcm[i] = view.getInt16(data.offset + i * 2, true)
  }
  return { channels, sampleRate, bitsPerSample, pcm }
}

function toMono(pcm: Int16Array, channels: number): Int16Array {
  if (channels === 1) return pcm
  const frames = Math.floor(pcm.length / channels)
  const out = new Int16Array(frames)
  for (let i = 0; i < frames; i += 1) {
    out[i] = pcm[i * channels]!
  }
  return out
}

/** 线性重采样到目标采样率（enrollment 格式闸门用，非听感优化） */
export function resampleMonoPcm16(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || pcm.length === 0) return pcm
  const outLen = Math.max(1, Math.round((pcm.length * toRate) / fromRate))
  const out = new Int16Array(outLen)
  const ratio = (pcm.length - 1) / Math.max(1, outLen - 1)
  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(pcm.length - 1, i0 + 1)
    const t = src - i0
    out[i] = Math.round(pcm[i0]! * (1 - t) + pcm[i1]! * t)
  }
  return out
}

export function encodeMonoPcm16Wav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const dataSize = pcm.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  let o = 44
  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(o, pcm[i]!, true)
    o += 2
  }
  return new Uint8Array(buffer)
}

/**
 * 读取 `voice_forge/default_sample`，转成 ≥24kHz 单声道 16bit WAV。
 */
export function prepareWavBytesForEnrollment(
  raw: Uint8Array,
  referenceText = '',
  label = '样本'
): PreparedOfficialSample {
  if (raw.byteLength > QWEN_ENROLL_MAX_BYTES) {
    return { ok: false, detail: `${label}超过 10MB，无法上传百炼` }
  }

  const parsed = parsePcm16Wav(raw)
  if (!parsed) {
    return { ok: false, detail: `${label}须为 PCM16 WAV` }
  }

  let mono = toMono(parsed.pcm, parsed.channels)
  const targetSr = Math.max(parsed.sampleRate, QWEN_ENROLL_TARGET_SR)
  if (parsed.sampleRate !== targetSr) {
    mono = resampleMonoPcm16(mono, parsed.sampleRate, targetSr)
  }

  let durationSec = mono.length / targetSr
  if (durationSec < QWEN_ENROLL_MIN_SECONDS) {
    return {
      ok: false,
      detail: `${label}过短（${durationSec.toFixed(1)}s），百炼要求至少约 ${QWEN_ENROLL_MIN_SECONDS} 秒清晰朗读`
    }
  }

  if (durationSec > QWEN_ENROLL_MAX_SECONDS) {
    const keep = Math.floor(QWEN_ENROLL_MAX_SECONDS * targetSr)
    mono = mono.subarray(0, keep)
    durationSec = mono.length / targetSr
  }

  const wavBytes = encodeMonoPcm16Wav(mono, targetSr)
  if (wavBytes.byteLength > QWEN_ENROLL_MAX_BYTES) {
    return { ok: false, detail: '转换后样本仍超过 10MB' }
  }

  return {
    ok: true,
    wavBytes,
    mime: 'audio/wav',
    referenceText: referenceText.trim(),
    durationSec,
    sampleRate: targetSr
  }
}

export function prepareOfficialSampleForEnrollment(
  sampleDir: string = defaultSampleDir()
): PreparedOfficialSample {
  const wavPath = join(sampleDir, 'reference.wav')
  if (!existsSync(wavPath)) {
    return { ok: false, detail: '未找到官方样本 reference.wav' }
  }

  const raw = new Uint8Array(readFileSync(wavPath))
  const referenceText = readUtf8IfExists(join(sampleDir, 'reference.txt'))
  return prepareWavBytesForEnrollment(raw, referenceText, '官方样本')
}
