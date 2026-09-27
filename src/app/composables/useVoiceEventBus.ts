import type { CorpusData } from '../../types/corpus'
import type { VoiceForgeStatus } from '../../services/voiceForgeApi'

export type CloudVoiceForgeStartDetail = {
  displayName: string
  voicePrompt: string
  corpus: CorpusData
  previewText?: string
}

export const CLOUD_VOICE_FORGE_START_EVENT = 'cloud-voice-forge-start'

export interface VoiceEventBusTarget {
  enterGeneratingBoot: (flow?: 'create' | 'cloud_create', msg?: string) => void
  enterReview: (status: VoiceForgeStatus) => void
  finishReady?: () => Promise<void>
  onCloudCreateFailed?: (detail: string) => void
}

const STORAGE_KEY = 'xue.cloudVoiceForge.lastCreate'

let lastCloudCreateDetail: CloudVoiceForgeStartDetail | null = null

function readStoredDetail(): CloudVoiceForgeStartDetail | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CloudVoiceForgeStartDetail
    if (!parsed?.voicePrompt || !parsed?.corpus) return null
    return parsed
  } catch {
    return null
  }
}

export function rememberCloudCreateDetail(detail: CloudVoiceForgeStartDetail): void {
  lastCloudCreateDetail = detail
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(detail))
  } catch {
    /* ignore quota */
  }
}

/** vitest：清空内存与 session 里的上次创造参数 */
export function resetCloudCreateDetailForTests(): void {
  lastCloudCreateDetail = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function detailFromRejectPending(pending: {
  displayName?: string
  voicePrompt?: string
  previewText?: string
  corpus?: CorpusData
} | null): CloudVoiceForgeStartDetail | null {
  if (!pending?.voicePrompt?.trim() || !pending.corpus) return null
  return {
    displayName: pending.displayName?.trim() || '云端设计音色',
    voicePrompt: pending.voicePrompt,
    corpus: pending.corpus,
    previewText: pending.previewText
  }
}

function isUsableDetail(
  detail: CloudVoiceForgeStartDetail | null | undefined
): detail is CloudVoiceForgeStartDetail {
  return Boolean(detail?.voicePrompt?.trim() && detail.corpus)
}

async function designAndEnterReview(
  detail: CloudVoiceForgeStartDetail,
  target: VoiceEventBusTarget
): Promise<void> {
  rememberCloudCreateDetail(detail)
  const result = await window.electronAPI?.designTtsCloudVoice?.({
    displayName: detail.displayName,
    voicePrompt: detail.voicePrompt,
    previewText: detail.previewText,
    stageOnly: true,
    corpus: detail.corpus
  })
  if (!result?.ok) {
    // 退出 Boot 由 UI（知道了）触发，避免遮罩瞬间消失用户看不到原因
    target.onCloudCreateFailed?.(result?.detail || '云端声音设计失败')
    return
  }
  target.enterReview({
    review_pending: true,
    phase: 'awaiting_review',
    flow: 'cloud_create',
    source: 'voice_design',
    displayName: detail.displayName,
    folderId: result.voiceId,
    reference_ready: true,
    ready: false,
    backend: 'cloud'
  })
}

async function runCloudDesignAndReview(
  detail: CloudVoiceForgeStartDetail,
  target: VoiceEventBusTarget
): Promise<void> {
  target.enterGeneratingBoot('cloud_create')
  try {
    await designAndEnterReview(detail, target)
  } catch (error) {
    target.onCloudCreateFailed?.(error instanceof Error ? error.message : '云端声音设计失败')
  }
}

/**
 * 重新生成：先 reject 拿盘上 pending（重启后内存/session 常空），门禁后再 design。
 * reject 只调用一次，避免暂存已清仍二次 reject。
 */
async function runCloudRegenerateAndReview(
  seedDetail: CloudVoiceForgeStartDetail | null | undefined,
  target: VoiceEventBusTarget
): Promise<void> {
  target.enterGeneratingBoot(
    'cloud_create',
    '正在按原提示词重新云端声音设计（可能需要数十秒）…'
  )

  try {
    let fromPending: CloudVoiceForgeStartDetail | null = null
    try {
      const rejected = await window.electronAPI?.rejectTtsCloudPending?.({
        action: 'regenerate'
      })
      fromPending = detailFromRejectPending(rejected?.ok ? rejected.pending : null)
    } catch (error) {
      console.warn('[voiceEventBus] reject pending before regenerate', error)
    }

    const next =
      fromPending ??
      (isUsableDetail(seedDetail) ? seedDetail : null) ??
      lastCloudCreateDetail ??
      readStoredDetail()

    if (!isUsableDetail(next)) {
      target.onCloudCreateFailed?.('无法重新生成：缺少上次创造参数')
      return
    }

    await designAndEnterReview(next, target)
  } catch (error) {
    target.onCloudCreateFailed?.(error instanceof Error ? error.message : '云端声音设计失败')
  }
}

export function useVoiceEventBus(target: VoiceEventBusTarget) {
  function onVoiceForgeBoot(): void {
    target.enterGeneratingBoot('create')
  }

  function onVoiceUploadReview(): void {
    void (async () => {
      const { fetchVoiceForgeStatus } = await import('../../services/voiceForgeApi')
      const status = await fetchVoiceForgeStatus()
      if (!status?.review_pending) {
        return
      }
      target.enterReview(status)
    })()
  }

  function onCloudVoiceForgeStart(event: Event): void {
    const detail = (event as CustomEvent<CloudVoiceForgeStartDetail>).detail
    if (!detail?.voicePrompt || !detail?.corpus) return
    void runCloudDesignAndReview(detail, target)
  }

  function rerunLastCloudDesign(detail?: CloudVoiceForgeStartDetail | null): void {
    // 即使 seed/内存/session 全空也要进 regenerating：权威参数在盘上 pending
    const seed = detail ?? lastCloudCreateDetail ?? readStoredDetail()
    void runCloudRegenerateAndReview(seed, target)
  }

  return {
    onVoiceForgeBoot,
    onVoiceUploadReview,
    onCloudVoiceForgeStart,
    rerunLastCloudDesign,
    rememberCloudCreateDetail
  }
}
