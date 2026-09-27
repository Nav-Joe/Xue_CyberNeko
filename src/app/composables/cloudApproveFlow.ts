import type { CorpusData } from '../../types/corpus'
import type { VoiceForgeStatus } from '../../services/voiceForgeApi'
import { setRuntimeCorpus } from '../../services/corpus'
import { setTouchFeedbackMode } from '../../services/touchModeSettings'

export type CloudPendingStatusPayload = {
  ok: true
  status: {
    review_pending: boolean
    phase: string | null
    flow: string | null
    source: string | null
    displayName: string | null
    folderId: string | null
    reference_ready: boolean
    ready: boolean
    backend: 'cloud'
  } | null
} | { ok: false; detail: string }

export type CloudApproveResult =
  | {
      ok: true
      localId: string
      corpus: CorpusData
    }
  | { ok: false; detail: string }
  | undefined

export type CloudApproveFailureAction =
  | { kind: 'restore-review'; status: VoiceForgeStatus; detail: string }
  | { kind: 'finish-ready'; detail: string }

/** approve 失败后：pending 仍在则恢复审阅，否则只能 finishReady */
export function resolveCloudApproveFailureAction(
  detail: string,
  pending: CloudPendingStatusPayload | null | undefined
): CloudApproveFailureAction {
  const status = pending && pending.ok ? pending.status : null
  if (status?.review_pending) {
    return {
      kind: 'restore-review',
      detail,
      status: {
        review_pending: true,
        phase: status.phase,
        flow: status.flow,
        source: status.source,
        displayName: status.displayName,
        folderId: status.folderId,
        reference_ready: status.reference_ready,
        ready: status.ready,
        backend: 'cloud'
      }
    }
  }
  return { kind: 'finish-ready', detail }
}

export type CloudApproveFlowDeps = {
  approve: () => Promise<CloudApproveResult>
  getPendingStatus: () => Promise<CloudPendingStatusPayload | null | undefined>
  prewarm: (opts: {
    corpus: CorpusData
    localId: string
  }) => Promise<
    | {
        ok: true
        corpus: CorpusData
        touchMode: 'custom_corpus'
        failed: number
        failures?: unknown
      }
    | { ok: false; detail?: string }
    | undefined
  >
  enterReview: (status: VoiceForgeStatus) => void
  finishReady: () => Promise<void>
  setReviewError: (detail: string | null) => void
  setPrewarmMessage: (msg: string) => void
  syncPetWindow: () => void
  logError?: (msg: string, extra?: unknown) => void
  logWarn?: (msg: string, extra?: unknown) => void
}

/**
 * 云端确认入库 + 预热。
 * 仅入库成功才 finishReady；approve 失败且 pending 仍在则恢复审阅窗。
 */
export async function runCloudApproveAndPrewarm(deps: CloudApproveFlowDeps): Promise<void> {
  let enrolled = false
  try {
    const approved = await deps.approve()
    if (!approved?.ok) {
      const detail =
        approved && 'detail' in approved && approved.detail
          ? approved.detail
          : '确认云端音色失败'
      deps.logError?.('[cloudApprove] approve failed', detail)
      let pending: CloudPendingStatusPayload | null | undefined
      try {
        pending = await deps.getPendingStatus()
      } catch (error) {
        deps.logWarn?.('[cloudApprove] getPendingStatus after approve fail', error)
      }
      const action = resolveCloudApproveFailureAction(detail, pending)
      if (action.kind === 'restore-review') {
        deps.setReviewError(action.detail)
        deps.enterReview(action.status)
        return
      }
      deps.setReviewError(null)
      await deps.finishReady()
      return
    }

    enrolled = true
    deps.setReviewError(null)
    setTouchFeedbackMode('custom_corpus')
    deps.setPrewarmMessage('正在云端合成触摸语料并落盘…')
    deps.syncPetWindow()

    const prewarm = await deps.prewarm({
      corpus: approved.corpus,
      localId: approved.localId
    })
    if (prewarm?.ok) {
      setRuntimeCorpus(prewarm.corpus)
      setTouchFeedbackMode(prewarm.touchMode)
      if (prewarm.failed > 0) {
        deps.logWarn?.('[cloudApprove] prewarm partial failures', prewarm.failures)
      }
    } else {
      deps.logWarn?.('[cloudApprove] prewarm failed', prewarm?.detail)
    }
  } catch (error) {
    deps.logError?.('[cloudApprove] approve/prewarm error', error)
    if (!enrolled) {
      const detail = error instanceof Error ? error.message : '确认云端音色失败'
      let pending: CloudPendingStatusPayload | null | undefined
      try {
        pending = await deps.getPendingStatus()
      } catch {
        /* ignore */
      }
      const action = resolveCloudApproveFailureAction(detail, pending)
      if (action.kind === 'restore-review') {
        deps.setReviewError(action.detail)
        deps.enterReview(action.status)
        return
      }
    }
  } finally {
    if (enrolled) {
      await deps.finishReady()
    }
  }
}
