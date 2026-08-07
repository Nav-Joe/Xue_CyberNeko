/** 录音电平：peak + 平滑（纯函数，宜单测） */

export function peakAbs(samples: ArrayLike<number>): number {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!)
    if (a > peak) peak = a
  }
  return peak > 1 ? 1 : peak
}

/**
 * 指数平滑：display 衰减慢一点，避免闪成噪声。
 * @param previous 上一帧展示值 0..1
 * @param peak 本块瞬时峰值 0..1
 */
export function smoothLevel(previous: number, peak: number, attack = 0.35, release = 0.15): number {
  const p = previous < 0 ? 0 : previous > 1 ? 1 : previous
  const k = peak < 0 ? 0 : peak > 1 ? 1 : peak
  const alpha = k >= p ? attack : release
  const next = p * (1 - alpha) + k * alpha
  return next < 0.001 ? 0 : next > 1 ? 1 : next
}
