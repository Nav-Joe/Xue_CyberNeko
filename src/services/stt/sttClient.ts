import {
  STT_HEALTH_PATH,
  STT_PORT_CANDIDATES,
  STT_RECOGNIZE_PATH
} from './constants'

export type SttHealth = {
  ok: boolean
  service?: string
  modelReady?: boolean
  sampleRate?: number
}

export type SttRecognizeOk = {
  ok: true
  text: string
  durationMs?: number
  decodeMs?: number
  language?: string
}

export type SttRecognizeErr = {
  ok: false
  error?: string
  message?: string
}

export class SttClientError extends Error {
  readonly code: string

  constructor(message: string, code = 'stt_error') {
    super(message)
    this.name = 'SttClientError'
    this.code = code
  }
}

function trimBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

async function fetchHealth(baseUrl: string, signal?: AbortSignal): Promise<SttHealth | null> {
  try {
    const res = await fetch(`${trimBaseUrl(baseUrl)}${STT_HEALTH_PATH}`, {
      method: 'GET',
      signal
    })
    if (!res.ok) return null
    const json = (await res.json()) as SttHealth
    if (json?.service !== 'stt') return null
    return json
  } catch {
    return null
  }
}

/**
 * 解析侧车基址：配置非空则只探该址（高级覆盖）；否则扫 8767–8772。
 * 调用方可自行缓存；侧车换端口后应清缓存再调本函数。
 */
export async function resolveSttBaseUrl(
  configuredBaseUrl = '',
  options?: { signal?: AbortSignal }
): Promise<string> {
  const configured = trimBaseUrl(configuredBaseUrl)
  if (configured) {
    const health = await fetchHealth(configured, options?.signal)
    if (!health) {
      throw new SttClientError('语音服务未启动或地址不可达', 'unreachable')
    }
    if (health.modelReady === false) {
      throw new SttClientError('语音模型尚未就绪，请稍候再试', 'model_not_ready')
    }
    return configured
  }

  for (const port of STT_PORT_CANDIDATES) {
    const base = `http://127.0.0.1:${port}`
    const health = await fetchHealth(base, options?.signal)
    if (!health) continue
    if (health.modelReady === false) {
      throw new SttClientError('语音模型尚未就绪，请稍候再试', 'model_not_ready')
    }
    return base
  }

  throw new SttClientError(
    '语音服务未启动。请先运行 stt_service（见 stt_service/README.md）',
    'unreachable'
  )
}

export async function recognizeWav(
  baseUrl: string,
  wav: Blob,
  options?: { language?: string; signal?: AbortSignal }
): Promise<SttRecognizeOk> {
  const form = new FormData()
  form.append('file', wav, 'recording.wav')
  if (options?.language) {
    form.append('language', options.language)
  }

  let res: Response
  try {
    res = await fetch(`${trimBaseUrl(baseUrl)}${STT_RECOGNIZE_PATH}`, {
      method: 'POST',
      body: form,
      signal: options?.signal
    })
  } catch (err) {
    const hint = err instanceof Error ? err.message : ''
    // Chromium 跨域失败与「进程真没起来」都会进 catch；文案引导重启侧车以覆盖旧版无 CORS 进程
    throw new SttClientError(
      hint.toLowerCase().includes('cors') || hint.toLowerCase().includes('failed to fetch')
        ? '无法连接语音服务（请确认 stt_service 已启动且为最新版本后重启侧车）'
        : '语音服务未启动或网络中断',
      'unreachable'
    )
  }

  let body: SttRecognizeOk | SttRecognizeErr
  try {
    body = (await res.json()) as SttRecognizeOk | SttRecognizeErr
  } catch {
    throw new SttClientError('语音识别响应无效', 'bad_response')
  }

  if (!res.ok || body.ok === false) {
    const errBody = body as SttRecognizeErr
    const msg =
      (typeof errBody.message === 'string' && errBody.message.trim()) ||
      (res.status === 413
        ? '录音过长，请控制在 60 秒内'
        : res.status === 503
          ? '语音模型尚未就绪'
          : '语音识别失败')
    throw new SttClientError(msg, errBody.error || `http_${res.status}`)
  }

  const text = typeof (body as SttRecognizeOk).text === 'string' ? (body as SttRecognizeOk).text : ''
  return { ...(body as SttRecognizeOk), ok: true, text }
}
