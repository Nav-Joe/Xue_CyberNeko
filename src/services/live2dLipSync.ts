import type { Live2DModel } from 'pixi-live2d-display/cubism4'

const MOUTH_OPEN_PARAM = 'ParamMouthOpenY'

/** 口型灵敏度：RMS × 该系数后 clamp 到 [0, 1] */
const MOUTH_GAIN = 5.5
/** 低于该 RMS 视为静音，避免底噪让嘴一直微张 */
const MOUTH_NOISE_GATE = 0.018

const ATTACK = 0.55
const RELEASE = 0.28

let registeredModel: Live2DModel | null = null
let mouthParamIndex: number | null = null
let mouthParamReady = false

let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
const sourceByAudio = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()

let rafId: number | null = null
let smoothedOpen = 0
let activeAudio: HTMLAudioElement | null = null

function getCoreModel(model: Live2DModel): {
  setParameterValueByIndex?: (index: number, value: number) => void
  getParameterIndex?: (id: string) => number
} | null {
  const internal = model.internalModel as {
    coreModel?: {
      setParameterValueByIndex?: (index: number, value: number) => void
      getParameterIndex?: (id: string) => number
    }
  }
  return internal.coreModel ?? null
}

function resolveMouthParamIndex(model: Live2DModel): number | null {
  const core = getCoreModel(model)
  if (!core?.getParameterIndex || !core.setParameterValueByIndex) {
    return null
  }
  const index = core.getParameterIndex(MOUTH_OPEN_PARAM)
  if (typeof index !== 'number' || index < 0) {
    return null
  }
  return index
}

function setMouthOpen(value: number): void {
  if (!registeredModel || mouthParamIndex === null) {
    return
  }
  const core = getCoreModel(registeredModel)
  core?.setParameterValueByIndex?.(mouthParamIndex, Math.max(0, Math.min(1, value)))
}

function ensureAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.35
  }
  return audioContext
}

async function ensureAudioContextRunning(): Promise<void> {
  const ctx = ensureAudioContext()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
}

function connectAudioToAnalyser(audio: HTMLAudioElement): void {
  const ctx = ensureAudioContext()
  if (!analyser) {
    return
  }
  if (!sourceByAudio.has(audio)) {
    const source = ctx.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(ctx.destination)
    sourceByAudio.set(audio, source)
  }
}

function computeMouthTarget(rms: number): number {
  if (rms < MOUTH_NOISE_GATE) {
    return 0
  }
  return Math.min(1, (rms - MOUTH_NOISE_GATE) * MOUTH_GAIN)
}

function stopLipSyncLoop(resetMouth = true): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  activeAudio = null
  smoothedOpen = 0
  if (resetMouth) {
    setMouthOpen(0)
  }
}

function startLipSyncLoop(audio: HTMLAudioElement, onDone: () => void): void {
  stopLipSyncLoop(false)
  activeAudio = audio

  if (!registeredModel || mouthParamIndex === null) {
    const finish = (): void => {
      audio.removeEventListener('ended', finish)
      audio.removeEventListener('pause', finish)
      onDone()
    }
    audio.addEventListener('ended', finish, { once: true })
    audio.addEventListener('pause', finish, { once: true })
    return
  }

  connectAudioToAnalyser(audio)

  const timeDomain = new Uint8Array(analyser!.fftSize)

  const tick = (): void => {
    if (activeAudio !== audio || audio.ended) {
      stopLipSyncLoop()
      onDone()
      return
    }

    if (audio.paused) {
      stopLipSyncLoop()
      onDone()
      return
    }

    analyser!.getByteTimeDomainData(timeDomain)
    let sumSquares = 0
    for (let i = 0; i < timeDomain.length; i += 1) {
      const sample = (timeDomain[i] - 128) / 128
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / timeDomain.length)
    const target = computeMouthTarget(rms)
    const blend = target > smoothedOpen ? ATTACK : RELEASE
    smoothedOpen = smoothedOpen * (1 - blend) + target * blend
    setMouthOpen(smoothedOpen)

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
}

export function registerLive2DModelForLipSync(model: Live2DModel): void {
  registeredModel = model
  mouthParamReady = false
  mouthParamIndex = resolveMouthParamIndex(model)
  if (mouthParamIndex === null && import.meta.env.DEV) {
    console.warn(`[Live2D/LipSync] 模型未找到参数 ${MOUTH_OPEN_PARAM}，口型同步已禁用`)
  }
}

export function unregisterLive2DModelForLipSync(): void {
  stopLipSync()
  registeredModel = null
  mouthParamIndex = null
  mouthParamReady = false
}

export function stopLipSync(): void {
  stopLipSyncLoop()
}

/** 播放期间驱动口型；在 audio.play() 之前或之后调用均可。 */
export async function runLipSyncWhilePlaying(audio: HTMLAudioElement): Promise<void> {
  if (!registeredModel) {
    if (audio.ended) {
      return
    }
    await new Promise<void>((resolve) => {
      audio.addEventListener('ended', () => resolve(), { once: true })
      audio.addEventListener('pause', () => resolve(), { once: true })
    })
    return
  }

  if (mouthParamIndex === null && !mouthParamReady) {
    mouthParamIndex = resolveMouthParamIndex(registeredModel)
    mouthParamReady = true
  }

  await ensureAudioContextRunning()

  await new Promise<void>((resolve) => {
    startLipSyncLoop(audio, resolve)
  })
}
