import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resetCloudCreateDetailForTests,
  useVoiceEventBus,
  type VoiceEventBusTarget
} from '../useVoiceEventBus'

const sampleCorpus = {
  head: ['你好'],
  arms: [],
  body: [],
  legs: [],
  tail: []
}

function makeTarget(overrides?: Partial<VoiceEventBusTarget>): VoiceEventBusTarget & {
  enterReview: ReturnType<typeof vi.fn>
  enterGeneratingBoot: ReturnType<typeof vi.fn>
  finishReady: ReturnType<typeof vi.fn>
  onCloudCreateFailed: ReturnType<typeof vi.fn>
} {
  return {
    enterGeneratingBoot: vi.fn(),
    enterReview: vi.fn(),
    finishReady: vi.fn(async () => undefined),
    onCloudCreateFailed: vi.fn(),
    ...overrides
  }
}

describe('useVoiceEventBus cloud regenerate restore', () => {
  beforeEach(() => {
    resetCloudCreateDetailForTests()
    Reflect.deleteProperty(window, 'electronAPI')
  })

  afterEach(() => {
    resetCloudCreateDetailForTests()
    Reflect.deleteProperty(window, 'electronAPI')
    vi.restoreAllMocks()
  })

  it('seed empty + reject returns pending → calls design once (no double reject)', async () => {
    const rejectTtsCloudPending = vi.fn().mockResolvedValue({
      ok: true,
      action: 'regenerate',
      pending: {
        kind: 'vd',
        displayName: '从暂存恢复',
        voiceId: 'remote-1',
        voicePrompt: '温柔女声',
        previewText: '试听一句',
        corpus: sampleCorpus,
        createdAt: 1
      },
      config: {}
    })
    const designTtsCloudVoice = vi.fn().mockResolvedValue({
      ok: true,
      voiceId: 'remote-2',
      previewAudio: new ArrayBuffer(0),
      mime: 'audio/wav'
    })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { rejectTtsCloudPending, designTtsCloudVoice }
    })

    const target = makeTarget()
    const bus = useVoiceEventBus(target)
    bus.rerunLastCloudDesign(null)

    await vi.waitFor(() => {
      expect(designTtsCloudVoice).toHaveBeenCalledTimes(1)
    })

    expect(rejectTtsCloudPending).toHaveBeenCalledTimes(1)
    expect(rejectTtsCloudPending).toHaveBeenCalledWith({ action: 'regenerate' })
    expect(designTtsCloudVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: '从暂存恢复',
        voicePrompt: '温柔女声',
        stageOnly: true,
        corpus: sampleCorpus
      })
    )
    expect(target.enterReview).toHaveBeenCalledWith(
      expect.objectContaining({
        review_pending: true,
        backend: 'cloud',
        folderId: 'remote-2',
        displayName: '从暂存恢复'
      })
    )
    expect(target.onCloudCreateFailed).not.toHaveBeenCalled()
  })

  it('seed empty + reject has no pending → fails without design or finishReady', async () => {
    const rejectTtsCloudPending = vi.fn().mockResolvedValue({
      ok: false,
      detail: '没有待确认的云端音色'
    })
    const designTtsCloudVoice = vi.fn()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { rejectTtsCloudPending, designTtsCloudVoice }
    })

    const target = makeTarget()
    useVoiceEventBus(target).rerunLastCloudDesign(null)

    await vi.waitFor(() => {
      expect(target.onCloudCreateFailed).toHaveBeenCalledWith('无法重新生成：缺少上次创造参数')
    })
    expect(designTtsCloudVoice).not.toHaveBeenCalled()
    // 退出由 Boot「知道了」触发，bus 不自动 finishReady
    expect(target.finishReady).not.toHaveBeenCalled()
  })

  it('design ok:false → onCloudCreateFailed and no finishReady', async () => {
    const designTtsCloudVoice = vi.fn().mockResolvedValue({
      ok: false,
      detail: '百炼返回错误'
    })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { designTtsCloudVoice }
    })

    const target = makeTarget()
    const bus = useVoiceEventBus(target)
    bus.onCloudVoiceForgeStart(
      new CustomEvent('cloud-voice-forge-start', {
        detail: {
          displayName: '测试',
          voicePrompt: '温柔女声',
          corpus: sampleCorpus
        }
      })
    )

    await vi.waitFor(() => {
      expect(target.onCloudCreateFailed).toHaveBeenCalledWith('百炼返回错误')
    })
    expect(target.enterReview).not.toHaveBeenCalled()
    expect(target.finishReady).not.toHaveBeenCalled()
  })
})
