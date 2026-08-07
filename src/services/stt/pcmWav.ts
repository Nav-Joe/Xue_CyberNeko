/**
 * Float32 mono PCM → 16-bit little-endian WAV（无依赖，宜单测）。
 * 若 sampleRate ≠ targetRate，线性重采样到 targetRate。
 */
export function resampleMonoLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate || input.length === 0) {
    return input
  }
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const t = src - i0
    out[i] = input[i0]! * (1 - t) + input[i1]! * t
  }
  return out
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

/** 编码 mono Float32（-1..1）为 16-bit PCM WAV ArrayBuffer */
export function encodeMono16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length
  const dataBytes = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    const int16 = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
    view.setInt16(offset, int16, true)
    offset += 2
  }
  return buffer
}

/** 重采样到 16 kHz 后编码 WAV Blob */
export function float32ToWavBlob(
  samples: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16_000
): Blob {
  const mono = resampleMonoLinear(samples, inputSampleRate, targetSampleRate)
  const ab = encodeMono16Wav(mono, targetSampleRate)
  return new Blob([ab], { type: 'audio/wav' })
}
