import { describe, expect, it } from 'vitest'

import { encodeMono16Wav, resampleMonoLinear } from '../pcmWav'

describe('pcmWav', () => {
  it('encodeMono16Wav writes RIFF/WAVE header and sample rate', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1])
    const ab = encodeMono16Wav(samples, 16_000)
    const view = new DataView(ab)
    const ascii = (offset: number, len: number) =>
      String.fromCharCode(...new Uint8Array(ab, offset, len))

    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(ascii(12, 4)).toBe('fmt ')
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(samples.length * 2)
    expect(ab.byteLength).toBe(44 + samples.length * 2)
  })

  it('resampleMonoLinear downsamples 48k → 16k roughly 3:1', () => {
    const input = new Float32Array(480)
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(i / 10)
    const out = resampleMonoLinear(input, 48_000, 16_000)
    expect(out.length).toBe(160)
  })

  it('resampleMonoLinear identity when rates match', () => {
    const input = new Float32Array([0.1, 0.2, 0.3])
    expect(resampleMonoLinear(input, 16_000, 16_000)).toBe(input)
  })
})
