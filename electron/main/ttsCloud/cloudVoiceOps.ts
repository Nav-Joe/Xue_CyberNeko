import type { CorpusData } from '../../../src/types/corpus'
import { formatFetchError, getAppFetch, type AppFetch } from './appFetch'
import { getTtsCloudConfigStore } from './configStore'
import { addCloudVoice, sanitizePreferredName } from './activeVoice'
import { enrollQwenVcHttp } from './enrollVcHttp'
import {
  mapQwenDesignFailure,
  mapQwenHttpFailure,
  mapQwenNetworkError
} from './mapQwenFailure'
import { prepareOfficialSampleForEnrollment, prepareWavBytesForEnrollment } from './prepareOfficialSample'
import { clearCloudPendingCreate, writeCloudPendingCreate } from './pendingCloudCreate'
import { buildQwenEnrollmentUrl } from './readiness'
import { cloudSynthesizeLock } from './synthesizeLock'
import {
  DEFAULT_QWEN_VD_MODEL,
  type TtsCloudConfig,
  type TtsCloudConfigPatch,
  type TtsCloudConfigView
} from './types'

export type CloudVoiceOpOk = {
  ok: true
  voiceId: string
  localId: string
  config: TtsCloudConfigView
  previewAudio?: ArrayBuffer
  previewMime?: string
}
export type CloudVoiceOpErr = { ok: false; detail: string }
export type CloudVoiceOpResult = CloudVoiceOpOk | CloudVoiceOpErr

export type CloudVoiceStore = {
  read: () => TtsCloudConfig
  writePatch: (patch: TtsCloudConfigPatch) => TtsCloudConfig
  getView: () => TtsCloudConfigView
}

function resolveStore(store?: CloudVoiceStore): CloudVoiceStore {
  return store ?? getTtsCloudConfigStore()
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

/** C2：官方样本 VC 克隆 */
export async function enrollOfficialSampleCloud(options: {
  signal?: AbortSignal
  fetchImpl?: AppFetch
  readConfig?: () => TtsCloudConfig
  prepareSample?: typeof prepareOfficialSampleForEnrollment
  store?: CloudVoiceStore
} = {}): Promise<CloudVoiceOpResult> {
  const store = resolveStore(options.store)
  const config = options.readConfig ? options.readConfig() : store.read()
  if (!config.qwen.apiKey.trim()) {
    return { ok: false, detail: '请先在聊天设置填写百炼 API Key' }
  }

  const prepared = (options.prepareSample ?? prepareOfficialSampleForEnrollment)()
  if (!prepared.ok) return prepared

  return cloudSynthesizeLock.runExclusive(async (signal) => {
    const enrolled = await enrollQwenVcHttp({
      config,
      wavBytes: prepared.wavBytes,
      mime: prepared.mime,
      referenceText: prepared.referenceText,
      preferredName: 'xue_official',
      signal,
      fetchImpl: options.fetchImpl,
      failureLabel: '官方样本云克隆'
    })
    if (!enrolled.ok) return enrolled

    store.writePatch({
      qwen: { voiceId: enrolled.voiceId, vcModel: enrolled.model }
    })
    const view = store.getView()
    return {
      ok: true,
      voiceId: enrolled.voiceId,
      localId: view.qwen.activeVoiceLocalId,
      config: view
    }
  }, options.signal)
}

/** 自定义 WAV → VC 克隆（主进程持路径，不经渲染） */
export async function enrollCustomSampleCloud(options: {
  filePath: string
  displayName: string
  referenceText?: string
  signal?: AbortSignal
  fetchImpl?: AppFetch
  readConfig?: () => TtsCloudConfig
  readFile?: (path: string) => Uint8Array
  store?: CloudVoiceStore
}): Promise<CloudVoiceOpResult> {
  const store = resolveStore(options.store)
  const config = options.readConfig ? options.readConfig() : store.read()
  if (!config.qwen.apiKey.trim()) {
    return { ok: false, detail: '请先在聊天设置填写百炼 API Key' }
  }

  const name = options.displayName.trim() || '自定义云克隆'
  let raw: Uint8Array
  try {
    if (options.readFile) {
      raw = options.readFile(options.filePath)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readFileSync } = require('fs') as typeof import('fs')
      raw = new Uint8Array(readFileSync(options.filePath))
    }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? `无法读取 WAV：${error.message}` : '无法读取 WAV'
    }
  }

  const prepared = prepareWavBytesForEnrollment(raw, options.referenceText ?? '', '自定义样本')
  if (!prepared.ok) return prepared

  return cloudSynthesizeLock.runExclusive(async (signal) => {
    const enrolled = await enrollQwenVcHttp({
      config,
      wavBytes: prepared.wavBytes,
      mime: prepared.mime,
      referenceText: prepared.referenceText,
      preferredName: sanitizePreferredName(name, 'xue_custom'),
      signal,
      fetchImpl: options.fetchImpl,
      failureLabel: '自定义样本云克隆'
    })
    if (!enrolled.ok) return enrolled

    const next = store.read()
    const entry = addCloudVoice(next, {
      kind: 'vc',
      name,
      voiceId: enrolled.voiceId
    })
    store.writePatch({
      qwen: {
        voices: next.qwen.voices,
        activeVoiceLocalId: entry.id,
        vcModel: enrolled.model
      }
    })
    return {
      ok: true,
      voiceId: enrolled.voiceId,
      localId: entry.id,
      config: store.getView()
    }
  }, options.signal)
}

const DEFAULT_PREVIEW_TEXT = '大家好，我是雪澜。很高兴认识你。'

/** VD：文字描述创造音色 */
export async function designCloudVoice(options: {
  displayName: string
  voicePrompt: string
  previewText?: string
  /** 暂存审阅：不写入 voices，等确认后再入库 */
  stageOnly?: boolean
  corpus?: CorpusData
  userDataPath?: string
  signal?: AbortSignal
  fetchImpl?: AppFetch
  readConfig?: () => TtsCloudConfig
  store?: CloudVoiceStore
}): Promise<CloudVoiceOpResult> {
  const store = resolveStore(options.store)
  const config = options.readConfig ? options.readConfig() : store.read()
  const apiKey = config.qwen.apiKey.trim()
  if (!apiKey) {
    return { ok: false, detail: '请先在聊天设置填写百炼 API Key' }
  }

  const voicePrompt = options.voicePrompt.trim()
  if (!voicePrompt) {
    return { ok: false, detail: '请填写声音描述' }
  }
  if (voicePrompt.length > 2048) {
    return { ok: false, detail: '声音描述过长（最多 2048 字）' }
  }

  const previewText = (options.previewText?.trim() || DEFAULT_PREVIEW_TEXT).slice(0, 1024)
  const displayName = options.displayName.trim() || '云端设计音色'
  const model = config.qwen.vdModel.trim() || DEFAULT_QWEN_VD_MODEL
  const url = buildQwenEnrollmentUrl(config.qwen.baseUrl)
  const fetchImpl = options.fetchImpl ?? getAppFetch()
  const preferred = sanitizePreferredName(displayName, 'xue_vd')

  return cloudSynthesizeLock.runExclusive(async (signal) => {
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen-voice-design',
          input: {
            action: 'create',
            target_model: model,
            preferred_name: preferred,
            voice_prompt: voicePrompt,
            preview_text: previewText,
            language: 'zh'
          },
          parameters: {
            sample_rate: 24000,
            response_format: 'wav'
          }
        }),
        signal
      })
    } catch (error) {
      if (signal?.aborted || options.signal?.aborted) {
        return { ok: false, detail: '声音设计已取消' }
      }
      return {
        ok: false,
        detail: mapQwenDesignFailure(mapQwenNetworkError(url, formatFetchError(error)))
      }
    }

    const bodyText = await response.text().catch(() => '')
    if (!response.ok) {
      return {
        ok: false,
        detail: mapQwenDesignFailure(mapQwenHttpFailure(response.status, bodyText))
      }
    }

    let voiceId = ''
    let previewB64 = ''
    try {
      const parsed = JSON.parse(bodyText) as {
        output?: {
          voice?: string
          preview_audio?: { data?: string; response_format?: string }
        }
        code?: string
        message?: string
      }
      if (parsed.code && parsed.message) {
        return { ok: false, detail: mapQwenDesignFailure(parsed.message) }
      }
      voiceId = typeof parsed.output?.voice === 'string' ? parsed.output.voice.trim() : ''
      previewB64 =
        typeof parsed.output?.preview_audio?.data === 'string'
          ? parsed.output.preview_audio.data.trim()
          : ''
    } catch {
      return { ok: false, detail: mapQwenDesignFailure('返回无法解析') }
    }

    if (!voiceId) {
      return { ok: false, detail: mapQwenDesignFailure('未返回 voice ID') }
    }

    let previewAudio: ArrayBuffer | undefined
    if (previewB64) {
      try {
        const bytes = Uint8Array.from(Buffer.from(previewB64, 'base64'))
        if (bytes.byteLength > 0) previewAudio = toArrayBuffer(bytes)
      } catch {
        /* 预览可选 */
      }
    }

    if (options.stageOnly) {
      if (!options.userDataPath) {
        return { ok: false, detail: '暂存创造缺少 userData 路径' }
      }
      if (!options.corpus) {
        return { ok: false, detail: '暂存创造需要触摸语料' }
      }
      clearCloudPendingCreate(options.userDataPath)
      writeCloudPendingCreate(
        options.userDataPath,
        {
          kind: 'vd',
          displayName,
          voiceId,
          voicePrompt,
          previewText,
          corpus: options.corpus,
          createdAt: Date.now()
        },
        previewAudio
      )
      return {
        ok: true,
        voiceId,
        localId: '',
        config: store.getView(),
        previewAudio,
        previewMime: 'audio/wav'
      }
    }

    const next = store.read()
    const entry = addCloudVoice(next, {
      kind: 'vd',
      name: displayName,
      voiceId
    })
    store.writePatch({
      qwen: {
        voices: next.qwen.voices,
        activeVoiceLocalId: entry.id,
        vdModel: model
      }
    })

    return {
      ok: true,
      voiceId,
      localId: entry.id,
      config: store.getView(),
      previewAudio,
      previewMime: 'audio/wav'
    }
  }, options.signal)
}
