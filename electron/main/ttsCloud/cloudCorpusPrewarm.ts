import type { CorpusData } from '../../../src/types/corpus'
import { writeTouchConfig } from '../config/domains/touch'
import { normalizeCorpusPayload } from '../config/internal/corpus-utils'
import type { AppFetch } from './appFetch'
import { resolveActiveQwenVoice } from './activeVoice'
import {
  buildCloudManifestSkeleton,
  listLinesNeedingCloudPrewarm,
  readCloudCacheManifest,
  writeCloudCacheManifest,
  writeCloudCachePointer,
  writeCloudCacheWav,
  writeCloudVoiceCorpus
} from './cloudCorpusCache'
import { getTtsCloudConfigStore } from './configStore'
import { synthesizeQwenTtsHttp } from './qwenTtsClient'
import { checkCloudTtsReady } from './readiness'
import { cloudSynthesizeLock } from './synthesizeLock'
import type { TtsCloudConfig, TtsCloudConfigView } from './types'

export type CloudPrewarmResult =
  | {
      ok: true
      localId: string
      synthesized: number
      skipped: number
      failed: number
      total: number
      touchMode: 'custom_corpus'
      corpus: CorpusData
      config: TtsCloudConfigView
      failures: Array<{ line: string; detail: string }>
    }
  | { ok: false; detail: string }

export type CloudPrewarmStore = {
  read: () => TtsCloudConfig
  getView: () => TtsCloudConfigView
}

/**
 * 云端语料预热：每句 1 条 wav，落盘到 tts-cloud-cache/{localId}/。
 * 不要求已切 ttsBackend=qwen；触摸点击不走本函数。
 */
export async function prewarmCloudCorpus(options: {
  corpus: unknown
  localId?: string
  userDataPath: string
  signal?: AbortSignal
  fetchImpl?: AppFetch
  readConfig?: () => TtsCloudConfig
  store?: CloudPrewarmStore
  applyTouchMode?: boolean
}): Promise<CloudPrewarmResult> {
  const store = options.store ?? getTtsCloudConfigStore()
  const config = options.readConfig ? options.readConfig() : store.read()
  const active = resolveActiveQwenVoice(config)
  const localId = (options.localId?.trim() || active?.localId || '').trim()
  if (!localId) {
    return { ok: false, detail: '请先选择一条云端音色再预热语料' }
  }

  const voice = config.qwen.voices.find((v) => v.id === localId)
  if (!voice?.voiceId.trim()) {
    return { ok: false, detail: '找不到要预热的云端音色' }
  }

  const workingConfig: TtsCloudConfig = {
    ...config,
    qwen: {
      ...config.qwen,
      activeVoiceLocalId: localId,
      voices: config.qwen.voices.map((v) => ({ ...v }))
    }
  }

  const ready = checkCloudTtsReady(workingConfig, 'preview')
  if (!ready.ok) {
    return ready
  }

  const corpus = normalizeCorpusPayload(options.corpus)
  const prevManifest = readCloudCacheManifest(options.userDataPath, localId)
  const model =
    voice.kind === 'vd' ? workingConfig.qwen.vdModel : workingConfig.qwen.vcModel
  const { manifest, lines } = buildCloudManifestSkeleton({
    localVoiceId: localId,
    bailianVoiceId: voice.voiceId,
    kind: voice.kind,
    model,
    corpus,
    existingEntries: prevManifest?.entries
  })

  if (lines.length === 0) {
    return { ok: false, detail: '语料为空，请先添加触摸台词' }
  }

  writeCloudVoiceCorpus(options.userDataPath, localId, corpus)

  const need = listLinesNeedingCloudPrewarm(options.userDataPath, localId, manifest, lines)
  const failures: Array<{ line: string; detail: string }> = []
  let synthesized = 0

  for (const line of need) {
    if (options.signal?.aborted) {
      return { ok: false, detail: '云端语料预热已取消' }
    }
    const synth = await cloudSynthesizeLock.runExclusive(
      (signal) =>
        synthesizeQwenTtsHttp({
          config: workingConfig,
          text: line,
          signal,
          fetchImpl: options.fetchImpl
        }),
      options.signal
    )
    if (!synth.ok) {
      failures.push({ line, detail: synth.detail })
      continue
    }
    const key = manifest.entries[line]?.key
    if (!key) {
      failures.push({ line, detail: '内部缓存键缺失' })
      continue
    }
    writeCloudCacheWav(options.userDataPath, localId, key, synth.audio)
    synthesized += 1
  }

  writeCloudCacheManifest(options.userDataPath, localId, manifest)
  const cachedOk = lines.length - need.length + synthesized
  writeCloudCachePointer(options.userDataPath, localId, {
    version: 1,
    localVoiceId: localId,
    ready: cachedOk === lines.length && failures.length === 0,
    lineCount: lines.length,
    sourceHash: manifest.source_hash,
    updatedAt: new Date().toISOString()
  })

  if (options.applyTouchMode !== false) {
    writeTouchConfig('custom_corpus', corpus)
  }

  return {
    ok: true,
    localId,
    synthesized,
    skipped: lines.length - need.length,
    failed: failures.length,
    total: lines.length,
    touchMode: 'custom_corpus',
    corpus,
    config: store.getView(),
    failures
  }
}
