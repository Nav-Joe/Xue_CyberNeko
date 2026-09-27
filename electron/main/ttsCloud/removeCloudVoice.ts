import { formatFetchError, getAppFetch, type AppFetch } from './appFetch'
import { findVoiceByLocalId, removeCloudVoiceByLocalId } from './activeVoice'
import { removeCloudVoiceCacheDir } from './cloudCorpusCache'
import { getTtsCloudConfigStore } from './configStore'
import {
  mapQwenEnrollmentFailure,
  mapQwenHttpFailure,
  mapQwenNetworkError
} from './mapQwenFailure'
import { buildQwenEnrollmentUrl } from './readiness'
import { cloudSynthesizeLock } from './synthesizeLock'
import type { QwenVoiceKind, TtsCloudConfig, TtsCloudConfigPatch, TtsCloudConfigView } from './types'

export type RemoveCloudVoiceResult =
  | { ok: true; config: TtsCloudConfigView; remoteDeleted: boolean }
  | { ok: false; detail: string }

async function deleteRemoteVoice(options: {
  config: TtsCloudConfig
  kind: QwenVoiceKind
  bailianVoiceId: string
  fetchImpl?: AppFetch
  signal?: AbortSignal
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  const apiKey = options.config.qwen.apiKey.trim()
  if (!apiKey) {
    return { ok: false, detail: '缺少 API Key，无法删除云端音色' }
  }

  const url = buildQwenEnrollmentUrl(options.config.qwen.baseUrl)
  const fetchImpl = options.fetchImpl ?? getAppFetch()
  const isVd = options.kind === 'vd'
  const body = isVd
    ? {
        model: 'qwen-voice-design',
        input: { action: 'delete', voice: options.bailianVoiceId }
      }
    : {
        model: 'qwen-voice-enrollment',
        input: { action: 'delete', voice: options.bailianVoiceId }
      }

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: options.signal
    })
  } catch (error) {
    if (options.signal?.aborted) {
      return { ok: false, detail: '删除已取消' }
    }
    return {
      ok: false,
      detail: mapQwenEnrollmentFailure(
        mapQwenNetworkError(url, formatFetchError(error)),
        '删除云端音色'
      )
    }
  }

  const bodyText = await response.text().catch(() => '')
  if (!response.ok) {
    return {
      ok: false,
      detail: mapQwenEnrollmentFailure(
        mapQwenHttpFailure(response.status, bodyText),
        '删除云端音色'
      )
    }
  }
  return { ok: true }
}

/**
 * 从本地列表移除音色；可选同时请求百炼删除（失败仍可只删本地）。
 */
export async function removeCloudVoice(options: {
  localId: string
  deleteRemote?: boolean
  signal?: AbortSignal
  fetchImpl?: AppFetch
  readConfig?: () => TtsCloudConfig
  userDataPath?: string
  store?: {
    read: () => TtsCloudConfig
    writePatch: (patch: TtsCloudConfigPatch) => TtsCloudConfig
    getView: () => TtsCloudConfigView
  }
}): Promise<RemoveCloudVoiceResult> {
  const store = options.store ?? getTtsCloudConfigStore()
  const localId = options.localId.trim()
  if (!localId) {
    return { ok: false, detail: '未指定要删除的音色' }
  }

  const config = options.readConfig ? options.readConfig() : store.read()
  const target = findVoiceByLocalId(config, localId)
  if (!target) {
    return { ok: false, detail: '本地列表中没有该音色' }
  }

  let remoteDeleted = false
  if (options.deleteRemote !== false) {
    await cloudSynthesizeLock.runExclusive(async (signal) => {
      const remote = await deleteRemoteVoice({
        config,
        kind: target.kind,
        bailianVoiceId: target.voiceId,
        fetchImpl: options.fetchImpl,
        signal
      })
      remoteDeleted = remote.ok
    }, options.signal)
  }

  const next = store.read()
  if (!removeCloudVoiceByLocalId(next, localId)) {
    return { ok: false, detail: '本地列表中没有该音色' }
  }
  store.writePatch({
    qwen: {
      voices: next.qwen.voices,
      activeVoiceLocalId: next.qwen.activeVoiceLocalId
    }
  })

  if (options.userDataPath) {
    removeCloudVoiceCacheDir(options.userDataPath, localId)
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron')
      removeCloudVoiceCacheDir(app.getPath('userData'), localId)
    } catch {
      /* 非 Electron 测试环境可忽略 */
    }
  }

  return { ok: true, config: store.getView(), remoteDeleted }
}
