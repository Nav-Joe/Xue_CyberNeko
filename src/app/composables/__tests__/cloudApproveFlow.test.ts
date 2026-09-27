import { describe, expect, it, vi } from 'vitest'

import {
  resolveCloudApproveFailureAction,
  runCloudApproveAndPrewarm,
  type CloudApproveFlowDeps
} from '../cloudApproveFlow'

const sampleCorpus = {
  head: ['你好'],
  arms: [],
  body: [],
  legs: [],
  tail: []
}

const pendingStatus = {
  ok: true as const,
  status: {
    review_pending: true,
    phase: 'awaiting_review',
    flow: 'cloud_create',
    source: 'voice_design',
    displayName: '云音色',
    folderId: 'remote-1',
    reference_ready: true,
    ready: false,
    backend: 'cloud' as const
  }
}

describe('resolveCloudApproveFailureAction', () => {
  it('restores review when pending still exists', () => {
    const action = resolveCloudApproveFailureAction('写盘失败', pendingStatus)
    expect(action.kind).toBe('restore-review')
    if (action.kind === 'restore-review') {
      expect(action.detail).toBe('写盘失败')
      expect(action.status.backend).toBe('cloud')
      expect(action.status.folderId).toBe('remote-1')
    }
  })

  it('finish-ready when pending gone', () => {
    const action = resolveCloudApproveFailureAction('没有待确认的云端音色', {
      ok: true,
      status: null
    })
    expect(action).toEqual({
      kind: 'finish-ready',
      detail: '没有待确认的云端音色'
    })
  })
})

describe('runCloudApproveAndPrewarm', () => {
  function makeDeps(overrides: Partial<CloudApproveFlowDeps> = {}): CloudApproveFlowDeps {
    return {
      approve: vi.fn(),
      getPendingStatus: vi.fn(),
      prewarm: vi.fn(),
      enterReview: vi.fn(),
      finishReady: vi.fn(async () => undefined),
      setReviewError: vi.fn(),
      setPrewarmMessage: vi.fn(),
      syncPetWindow: vi.fn(),
      ...overrides
    }
  }

  it('approve fail + pending → restore review, no finishReady', async () => {
    const deps = makeDeps({
      approve: vi.fn().mockResolvedValue({ ok: false, detail: '写盘失败' }),
      getPendingStatus: vi.fn().mockResolvedValue(pendingStatus),
      prewarm: vi.fn()
    })

    await runCloudApproveAndPrewarm(deps)

    expect(deps.enterReview).toHaveBeenCalledWith(
      expect.objectContaining({
        review_pending: true,
        backend: 'cloud',
        folderId: 'remote-1'
      })
    )
    expect(deps.setReviewError).toHaveBeenCalledWith('写盘失败')
    expect(deps.finishReady).not.toHaveBeenCalled()
    expect(deps.prewarm).not.toHaveBeenCalled()
  })

  it('approve fail + no pending → finishReady', async () => {
    const deps = makeDeps({
      approve: vi.fn().mockResolvedValue({ ok: false, detail: '没有待确认的云端音色' }),
      getPendingStatus: vi.fn().mockResolvedValue({ ok: true, status: null })
    })

    await runCloudApproveAndPrewarm(deps)

    expect(deps.enterReview).not.toHaveBeenCalled()
    expect(deps.finishReady).toHaveBeenCalledTimes(1)
  })

  it('approve ok → prewarm then finishReady once', async () => {
    const deps = makeDeps({
      approve: vi.fn().mockResolvedValue({
        ok: true,
        localId: 'vd-1',
        corpus: sampleCorpus
      }),
      prewarm: vi.fn().mockResolvedValue({
        ok: true,
        corpus: sampleCorpus,
        touchMode: 'custom_corpus',
        failed: 0
      })
    })

    await runCloudApproveAndPrewarm(deps)

    expect(deps.prewarm).toHaveBeenCalledWith({
      corpus: sampleCorpus,
      localId: 'vd-1'
    })
    expect(deps.finishReady).toHaveBeenCalledTimes(1)
    expect(deps.enterReview).not.toHaveBeenCalled()
  })
})
