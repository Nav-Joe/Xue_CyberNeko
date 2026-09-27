import type { CorpusData } from '../../../src/types/corpus'
import { formatFetchError, getAppFetch, type AppFetch } from './appFetch'
import { addCloudVoice } from './activeVoice'
import { writeCloudVoiceCorpus } from './cloudCorpusCache'
import { getTtsCloudConfigStore } from './configStore'
import {
  mapQwenEnrollmentFailure,
  mapQwenHttpFailure,
  mapQwenNetworkError
} from './mapQwenFailure'
import {
  clearCloudPendingCreate,
  readCloudPendingCreate,
  readCloudPendingPreview,
  type CloudPendingCreate
} from './pendingCloudCreate'
import { buildQwenEnrollmentUrl } from './readiness'
import type { QwenVoiceKind, TtsCloudConfigView } from './types'

type TtsCloudConfigStore = ReturnType<typeof getTtsCloudConfigStore>

function resolveStore(store?: TtsCloudConfigStore): TtsCloudConfigStore {
  return store ?? getTtsCloudConfigStore()
}

export type ApproveCloudPendingResult =
  | {
      ok: true
      localId: string
      voiceId: string
      corpus: CorpusData
      config: TtsCloudConfigView
    }
  | { ok: false; detail: string }

export type RejectCloudPendingResult =
  | {
      ok: true
      action: 'regenerate' | 'skip'
      pending: CloudPendingCreate | null
      config: TtsCloudConfigView
    }
  | { ok: false; detail: string }

export function getCloudPendingReviewStatus(userDataPath: string): {
  review_pending: boolean
  phase: string | null
  flow: string | null
  source: string | null
  displayName: string | null
  folderId: string | null
  reference_ready: boolean
  ready: boolean
  backend: 'cloud'
} | null {
  const pending = readCloudPendingCreate(userDataPath)
  if (!pending) return null
  return {
    review_pending: true,
    phase: 'awaiting_review',
    flow: 'cloud_create',
    source: pending.kind === 'vc' ? 'upload' : 'voice_design',
    displayName: pending.displayName,
    folderId: pending.voiceId,
    reference_ready: true,
    ready: false,
    backend: 'cloud'
  }
}

export function approveCloudPendingCreate(options: {
  userDataPath: string
  store?: TtsCloudConfigStore
}): ApproveCloudPendingResult {
  const store = resolveStore(options.store)
  const pending = readCloudPendingCreate(options.userDataPath)
  if (!pending) {
    return { ok: false, detail: '没有待确认的云端音色' }
  }

  const next = store.read()
  const entry = addCloudVoice(next, {
    kind: pending.kind,
    name: pending.displayName,
    voiceId: pending.voiceId
  })
  store.writePatch({
    qwen: {
      voices: next.qwen.voices,
      activeVoiceLocalId: entry.id
    }
  })
  writeCloudVoiceCorpus(options.userDataPath, entry.id, pending.corpus)
  clearCloudPendingCreate(options.userDataPath)

  return {
    ok: true,
    localId: entry.id,
    voiceId: pending.voiceId,
    corpus: pending.corpus,
    config: store.getView()
  }
}

async function deleteRemoteVoiceBestEffort(options: {
  kind: QwenVoiceKind
  voiceId: string
  baseUrl: string
  apiKey: string
  fetchImpl?: AppFetch
}): Promise<void> {
  const apiKey = options.apiKey.trim()
  if (!apiKey || !options.voiceId.trim()) return
  const url = buildQwenEnrollmentUrl(options.baseUrl)
  const fetchImpl = options.fetchImpl ?? getAppFetch()
  const body =
    options.kind === 'vd'
      ? { model: 'qwen-voice-design', input: { action: 'delete', voice: options.voiceId } }
      : { model: 'qwen-voice-enrollment', input: { action: 'delete', voice: options.voiceId } }

  // 故意不走 cloudSynthesizeLock：删除挂起时不得堵住后续 design/prewarm。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn(
        '[ttsCloud]',
        mapQwenEnrollmentFailure(mapQwenHttpFailure(response.status, text), '删除暂存音色')
      )
    }
  } catch (error) {
    console.warn(
      '[ttsCloud]',
      mapQwenEnrollmentFailure(
        mapQwenNetworkError(url, formatFetchError(error)),
        '删除暂存音色'
      )
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function rejectCloudPendingCreate(options: {
  userDataPath: string
  action: 'regenerate' | 'skip'
  fetchImpl?: AppFetch
  store?: TtsCloudConfigStore
  /** 测试用：为 true 时等远端删除完成再返回 */
  awaitRemoteDelete?: boolean
}): Promise<RejectCloudPendingResult> {
  const store = resolveStore(options.store)
  const pending = readCloudPendingCreate(options.userDataPath)
  if (!pending) {
    return { ok: false, detail: '没有待确认的云端音色' }
  }

  const cfg = store.read()
  // 先清本地暂存，再让 UI 立刻回到「生成中」；远端删除不得阻塞重新设计（会抢合成锁）。
  clearCloudPendingCreate(options.userDataPath)

  const remoteDelete = deleteRemoteVoiceBestEffort({
    kind: pending.kind,
    voiceId: pending.voiceId,
    baseUrl: cfg.qwen.baseUrl,
    apiKey: cfg.qwen.apiKey,
    fetchImpl: options.fetchImpl
  })
  if (options.awaitRemoteDelete) {
    await remoteDelete
  } else {
    void remoteDelete
  }

  if (options.action === 'skip') {
    return { ok: true, action: 'skip', pending: null, config: store.getView() }
  }

  return {
    ok: true,
    action: 'regenerate',
    pending,
    config: store.getView()
  }
}

export function getCloudPendingPreviewAudio(userDataPath: string) {
  return readCloudPendingPreview(userDataPath)
}
