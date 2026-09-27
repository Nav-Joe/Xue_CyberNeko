import { describe, expect, it } from 'vitest'

import {
  encodeMonoPcm16Wav,
  parsePcm16Wav,
  prepareOfficialSampleForEnrollment,
  resampleMonoPcm16
} from '../prepareOfficialSample'
import { join } from 'path'

describe('prepareOfficialSample', () => {
  it('parses and round-trips mono pcm16 wav', () => {
    const pcm = new Int16Array([0, 1000, -1000, 0])
    const bytes = encodeMonoPcm16Wav(pcm, 24000)
    const parsed = parsePcm16Wav(bytes)
    expect(parsed).not.toBeNull()
    expect(parsed!.sampleRate).toBe(24000)
    expect(parsed!.channels).toBe(1)
    expect(Array.from(parsed!.pcm)).toEqual(Array.from(pcm))
  })

  it('resampleMonoPcm16 changes length with rate', () => {
    const pcm = new Int16Array(2400)
    const out = resampleMonoPcm16(pcm, 24000, 48000)
    expect(out.length).toBe(4800)
  })

  it('loads project official sample when present', () => {
    const sampleDir = join(process.cwd(), 'voice_forge', 'default_sample')
    const prepared = prepareOfficialSampleForEnrollment(sampleDir)
    expect(prepared.ok).toBe(true)
    if (prepared.ok) {
      expect(prepared.sampleRate).toBeGreaterThanOrEqual(24000)
      expect(prepared.durationSec).toBeGreaterThanOrEqual(3)
      expect(prepared.wavBytes.byteLength).toBeGreaterThan(44)
      expect(prepared.referenceText.length).toBeGreaterThan(0)
    }
  })
})
