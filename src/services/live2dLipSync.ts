import type { Live2DModel } from 'pixi-live2d-display/cubism4'

const MOUTH_OPEN_PARAM = 'ParamMouthOpenY'

/** 口型灵敏度：RMS × 该系数后 clamp 到 [0, 1] */
const MOUTH_GAIN = 5.5
/** 低于该 RMS 视为静音，避免底噪让嘴一直微张 */
const MOUTH_NOISE_GATE = 0.018

const ATTACK = 0.55
const RELEASE = 0.28

/** 极短静音 wav：在用户手势里 play 一次，解锁本窗口 HTMLMediaElement 自动播放 */
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

let registeredModel: Live2DModel | null = null
let mouthParamIndex: number | null = null
let mouthParamReady = false

let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
/** 口型分析链末端：gain=0，只为让 Analyser 留在图里，不发声 */
let analysisSink: GainNode | null = null

let rafId: number | null = null
let smoothedOpen = 0
let activeAudio: HTMLAudioElement | null = null
let activeBufferSource: AudioBufferSourceNode | null = null
let htmlMediaUnlocked = false

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
    analysisSink = audioContext.createGain()
    analysisSink.gain.value = 0
    analyser.connect(analysisSink)
    analysisSink.connect(audioContext.destination)
  }
  return audioContext
}

async function ensureAudioContextRunning(): Promise<boolean> {
  const ctx = ensureAudioContext()
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch (error) {
      console.warn('[Live2D/LipSync] AudioContext.resume 失败', error)
    }
  }
  return ctx.state === 'running'
}

async function unlockHtmlMedia(): Promise<void> {
  if (htmlMediaUnlocked) return
  const silent = new Audio(SILENT_WAV_DATA_URI)
  silent.volume = 0
  try {
    await silent.play()
    silent.pause()
    htmlMediaUnlocked = true
  } catch {
    // 手势外会失败；pointerdown 会再试
  }
}

/**
 * 在用户手势里调用：解锁 HTML 音频自动播放，并尽量把本窗口 AudioContext 拉到 running。
 * 小屋 / 桌宠是不同渲染进程，各自要解锁一次。
 */
export async function primeAudioPlayback(): Promise<void> {
  await unlockHtmlMedia()
  await ensureAudioContextRunning()
}

function ensureMouthReady(): boolean {
  if (!registeredModel) return false
  if (mouthParamIndex === null && !mouthParamReady) {
    mouthParamIndex = resolveMouthParamIndex(registeredModel)
    mouthParamReady = true
  }
  return mouthParamIndex !== null
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
  if (activeBufferSource) {
    try {
      activeBufferSource.stop()
    } catch {
      // already stopped
    }
    try {
      activeBufferSource.disconnect()
    } catch {
      // already disconnected
    }
    activeBufferSource = null
  }
  activeAudio = null
  smoothedOpen = 0
  if (resetMouth) {
    setMouthOpen(0)
  }
}

function waitAudioSettle(audio: HTMLAudioElement): Promise<void> {
  if (audio.ended) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = (): void => {
      audio.removeEventListener('ended', finish)
      audio.removeEventListener('pause', finish)
      resolve()
    }
    audio.addEventListener('ended', finish, { once: true })
    audio.addEventListener('pause', finish, { once: true })
  })
}

function whenPlaying(audio: HTMLAudioElement): Promise<void> {
  if (!audio.paused && !audio.ended) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (ok: boolean): void => {
      if (done) return
      done = true
      window.clearInterval(poll)
      audio.removeEventListener('playing', onPlaying)
      if (ok) resolve()
      else reject(new Error('playback did not start'))
    }
    const onPlaying = (): void => finish(true)
    audio.addEventListener('playing', onPlaying, { once: true })
    // cleanupAudio → stopLipSync 会清 activeAudio，取消空等
    const poll = window.setInterval(() => {
      if (activeAudio !== audio) finish(false)
    }, 40)
  })
}

function startAnalyserMouthLoop(audio: HTMLAudioElement, onDone: () => void): void {
  if (!analyser) {
    onDone()
    return
  }
  const timeDomain = new Uint8Array(analyser.fftSize)
  let settled = false

  const settle = (): void => {
    if (settled) return
    settled = true
    stopLipSyncLoop()
    onDone()
  }

  const tick = (): void => {
    if (settled || activeAudio !== audio || audio.ended || audio.paused) {
      settle()
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
  audio.addEventListener('ended', settle, { once: true })
}

/**
 * 兼容旧调用：不再把 audio 元素接到 Web Audio（MES 会劫持输出，小屋易整段静音）。
 * 口型请改用 runLipSyncFromArrayBuffer / runLipSyncWhilePlaying 的解码路径。
 */
export async function prepareLipSyncAudio(_audio: HTMLAudioElement): Promise<boolean> {
  if (!ensureMouthReady()) return false
  return ensureAudioContextRunning()
}

/**
 * 用音频副本驱动口型；扬声器只走 HTMLAudioElement，避免 createMediaElementSource 静音坑。
 * 与 element.play() 并行调用；内部会等到 element playing 再 start buffer。
 */
export async function runLipSyncFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
  element: HTMLAudioElement
): Promise<void> {
  if (!ensureMouthReady()) {
    await waitAudioSettle(element)
    return
  }

  const running = await ensureAudioContextRunning()
  if (!running || !analyser) {
    await waitAudioSettle(element)
    return
  }

  const ctx = audioContext!
  let buffer: AudioBuffer
  try {
    buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
  } catch (error) {
    console.warn('[Live2D/LipSync] decodeAudioData 失败，跳过口型', error)
    await waitAudioSettle(element)
    return
  }

  stopLipSyncLoop(false)
  activeAudio = element

  try {
    await whenPlaying(element)
  } catch {
    return
  }
  if (activeAudio !== element || element.ended || element.paused) {
    return
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(analyser)
  activeBufferSource = source

  await new Promise<void>((resolve) => {
    let settled = false
    const settle = (): void => {
      if (settled) return
      settled = true
      if (activeBufferSource === source) {
        activeBufferSource = null
      }
      stopLipSyncLoop()
      resolve()
    }
    source.onended = settle
    try {
      source.start(0)
    } catch (error) {
      console.warn('[Live2D/LipSync] buffer source start 失败', error)
      settle()
      return
    }
    startAnalyserMouthLoop(element, settle)
  })
}

export async function runLipSyncFromBlob(blob: Blob, element: HTMLAudioElement): Promise<void> {
  await runLipSyncFromArrayBuffer(await blob.arrayBuffer(), element)
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

/**
 * @deprecated 保留给旧调用；不再对接 MES。请优先 runLipSyncFromBlob。
 */
export async function runLipSyncWhilePlaying(audio: HTMLAudioElement): Promise<void> {
  await waitAudioSettle(audio)
}
