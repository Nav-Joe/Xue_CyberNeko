import { STT_MAX_DURATION_SEC, STT_SAMPLE_RATE } from './constants'
import { peakAbs, smoothLevel } from './micLevel'
import { listMicDevices, resolveMicChoice } from './micDevices'
import { float32ToWavBlob } from './pcmWav'

export type MicRecorderHandle = {
  /** 停录并返回 16 kHz mono WAV；未开录则抛错 */
  stop: () => Promise<Blob>
  /** 放弃录音并释放设备 */
  cancel: () => void
  /** 实际选用的麦（便于排查） */
  deviceLabel: string
}

export type StartMicRecordingOptions = {
  /** chat-config.sttDeviceId；空 = 系统默认 */
  deviceId?: string
  /** 平滑后的电平 0..1（约每 50ms 最多一次） */
  onLevel?: (level: number) => void
}

type ActiveSession = {
  stream: MediaStream
  context: AudioContext
  processor: ScriptProcessorNode
  source: MediaStreamAudioSourceNode
  chunks: Float32Array[]
  inputSampleRate: number
  startedAt: number
}

const LEVEL_EMIT_MIN_MS = 50

function mediaErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '麦克风权限被拒绝，请在系统设置中允许后重试'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '未找到麦克风设备'
  }
  return err instanceof Error ? err.message : '无法打开麦克风'
}

/**
 * 点麦开始：渲染进程采 PCM，停录后封成侧车约定的 16 kHz mono WAV。
 * 用 ScriptProcessor 累加样本（兼容性优先；日后可换 AudioWorklet）。
 */
export async function startMicRecording(
  options: StartMicRecordingOptions = {}
): Promise<MicRecorderHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前环境不支持麦克风录音')
  }

  const devices = await listMicDevices({ requestPermission: true })
  const preferred = resolveMicChoice(options.deviceId ?? '', devices)

  void window.electronAPI?.logRendererInfo?.({
    scope: 'stt-mic',
    message: `using mic label=${preferred.label} missing=${preferred.missing}`
  })

  let stream: MediaStream
  let deviceLabel = preferred.label
  try {
    const audio: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
    if (preferred.deviceId) {
      audio.deviceId = { exact: preferred.deviceId }
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio,
      video: false
    })
  } catch (err) {
    if (preferred.deviceId) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          },
          video: false
        })
        deviceLabel = `系统默认（所选麦不可用：${preferred.label}）`
      } catch (fallbackErr) {
        throw new Error(mediaErrorMessage(fallbackErr))
      }
    } else {
      throw new Error(mediaErrorMessage(err))
    }
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const context = new AudioCtx()
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  const inputSampleRate = context.sampleRate

  const session: ActiveSession = {
    stream,
    context,
    processor,
    source,
    chunks,
    inputSampleRate,
    startedAt: Date.now()
  }

  let displayLevel = 0
  let lastLevelEmitAt = 0
  const onLevel = options.onLevel

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(input))
    if (!onLevel) return
    displayLevel = smoothLevel(displayLevel, peakAbs(input))
    const now = Date.now()
    if (now - lastLevelEmitAt >= LEVEL_EMIT_MIN_MS) {
      lastLevelEmitAt = now
      onLevel(displayLevel)
    }
  }

  // ScriptProcessor 必须进音频图才会回调；增益置 0，避免麦声回放到扬声器形成啸叫/脏识别
  const mute = context.createGain()
  mute.gain.value = 0
  source.connect(processor)
  processor.connect(mute)
  mute.connect(context.destination)

  let finished = false

  const release = (): void => {
    processor.onaudioprocess = null
    try {
      processor.disconnect()
    } catch {
      /* ignore */
    }
    try {
      source.disconnect()
    } catch {
      /* ignore */
    }
    for (const track of stream.getTracks()) {
      track.stop()
    }
    void context.close().catch(() => undefined)
    onLevel?.(0)
  }

  return {
    deviceLabel,
    async stop(): Promise<Blob> {
      if (finished) {
        throw new Error('录音已结束')
      }
      finished = true
      release()

      const elapsedSec = (Date.now() - session.startedAt) / 1000
      if (elapsedSec > STT_MAX_DURATION_SEC + 0.5) {
        throw new Error('录音过长，请控制在 60 秒内')
      }

      const total = chunks.reduce((n, c) => n + c.length, 0)
      if (total === 0) {
        throw new Error(`没有采到声音（当前麦：${deviceLabel}）`)
      }
      const merged = new Float32Array(total)
      let offset = 0
      for (const c of chunks) {
        merged.set(c, offset)
        offset += c.length
      }

      let peak = 0
      for (let i = 0; i < merged.length; i++) {
        const a = Math.abs(merged[i]!)
        if (a > peak) peak = a
      }
      // 峰值过低多半是选错麦或系统静音；提前提示，避免空识别像「服务坏了」
      if (peak < 0.01) {
        throw new Error(`几乎没有声音（当前麦：${deviceLabel}）。请在设置中换麦或检查系统输入设备。`)
      }

      return float32ToWavBlob(merged, inputSampleRate, STT_SAMPLE_RATE)
    },
    cancel(): void {
      if (finished) return
      finished = true
      release()
    }
  }
}
