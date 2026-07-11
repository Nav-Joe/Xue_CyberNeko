import { computed, ref } from 'vue'
import { CORPUS_PREWARM_BOOT_STEPS, VOICE_CREATE_BOOT_STEPS } from '../../constants/petBoot'
import { fetchCacheStatus } from '../../services/audioCache'
import { loadTtsCapabilities } from '../../services/ttsCapabilities'
import {
  fetchVoiceForgeStatus,
  resumeVoiceForgeCreation,
  type VoiceForgeStatus
} from '../../services/voiceForgeApi'
import { getTouchFeedbackMode } from '../../services/touchModeSettings'
import {
  applyPrewarmUi,
  fetchPrewarmSnapshot,
  resolveCreateVoiceBoot,
  resolvePrewarmExit
} from '../bootPrewarm'
import type { AppBootStatus, BootFlow, BootPhase } from '../types'

export interface UseAppBootOptions {
  onConfigRefresh?: () => Promise<void>
  onReady?: () => Promise<void>
  onEnterReview?: () => void
  onEnterLoading?: () => void
}

export function useAppBoot(options: UseAppBootOptions = {}) {
  const phase = ref<BootPhase>('checking')
  const flow = ref<BootFlow>(null)
  const message = ref('正在检查语音服务…')
  const progress = ref<{ done: number; total: number } | null>(null)
  const reviewStatus = ref<VoiceForgeStatus | null>(null)
  const errorMessage = ref<string | null>(null)

  const status = computed<AppBootStatus>(() => {
    if (errorMessage.value) return 'error'
    if (phase.value === 'ready') return 'ready'
    if (phase.value === 'checking') return 'idle'
    return 'loading'
  })

  const showBootOverlay = computed(
    () =>
      phase.value === 'checking' ||
      phase.value === 'generating' ||
      phase.value === 'prewarming'
  )

  const inReview = computed(() => phase.value === 'review' && reviewStatus.value !== null)

  const bootSteps = computed(() =>
    flow.value === 'corpus' ? CORPUS_PREWARM_BOOT_STEPS : VOICE_CREATE_BOOT_STEPS
  )

  const currentStepId = computed((): string => {
    const p = phase.value
    if (p === 'generating' || p === 'review' || p === 'prewarming' || p === 'ready') return p
    return bootSteps.value[0]?.id ?? 'ready'
  })

  function enterGeneratingBoot(): void {
    flow.value = 'create'
    phase.value = 'generating'
    message.value = '正在生成克隆参考音（VoiceDesign 可能需要数分钟）…'
    progress.value = null
    reviewStatus.value = null
    options.onEnterLoading?.()
  }

  function enterPrewarmingBoot(msg = '正在预热触摸台词…', bootFlow: BootFlow = 'create'): void {
    flow.value = bootFlow
    phase.value = 'prewarming'
    message.value = msg
    reviewStatus.value = null
    options.onEnterLoading?.()
  }

  function enterReview(vfStatus: VoiceForgeStatus): void {
    flow.value = 'create'
    phase.value = 'review'
    reviewStatus.value = vfStatus
    options.onEnterReview?.()
  }

  async function finishReady(): Promise<void> {
    flow.value = null
    progress.value = null
    reviewStatus.value = null
    await options.onReady?.()
    phase.value = 'ready'
  }

  async function finishWithConfigRefresh(warn?: string): Promise<void> {
    if (warn) console.warn(warn)
    await finishReady()
    await options.onConfigRefresh?.()
  }

  async function evaluateInitialBoot(): Promise<void> {
    try {
      await options.onConfigRefresh?.()
      const caps = await loadTtsCapabilities()

      if (!caps.voiceForgeSupported) {
        if (getTouchFeedbackMode() === 'alt_engine_corpus') {
          const cache = await fetchCacheStatus()
          if (cache?.building) {
            enterPrewarmingBoot(undefined, 'corpus')
            return
          }
        }
        await finishReady()
        return
      }

      const vfStatus = await fetchVoiceForgeStatus()
      if (!vfStatus) {
        await finishReady()
        return
      }

      const createAction = resolveCreateVoiceBoot(vfStatus)
      if (createAction.kind === 'generating') {
        enterGeneratingBoot()
        if (createAction.resume) await resumeVoiceForgeCreation()
        return
      }
      if (createAction.kind === 'prewarming') {
        enterPrewarmingBoot()
        return
      }
      if (createAction.kind === 'review') {
        enterReview(createAction.status)
        return
      }

      if (getTouchFeedbackMode() === 'curated') {
        await finishReady()
        return
      }

      const cache = await fetchCacheStatus()
      if (cache?.building) {
        enterPrewarmingBoot(undefined, 'corpus')
        return
      }
      await finishReady()
    } catch (error) {
      console.error('[useAppBoot] evaluateInitialBoot failed', error)
      errorMessage.value = error instanceof Error ? error.message : '启动失败'
      phase.value = 'ready'
    }
  }

  async function refreshBootProgress(): Promise<void> {
    const p = phase.value
    if (p === 'ready' || p === 'checking' || p === 'review') return

    const vfStatus = await fetchVoiceForgeStatus()
    if (p === 'generating') {
      if (vfStatus?.review_pending && vfStatus.reference_ready) enterReview(vfStatus)
      return
    }
    if (p !== 'prewarming') return

    const { cache, prewarmStillRunning } = await fetchPrewarmSnapshot()
    applyPrewarmUi(cache, prewarmStillRunning, message, progress)

    const exit = resolvePrewarmExit(vfStatus, cache, prewarmStillRunning)
    if (exit === 'finish') {
      await finishWithConfigRefresh()
    } else if (exit === 'finish-warn') {
      await finishWithConfigRefresh('[useAppBoot] 语料预热未能启动，已退出等待')
    }
  }

  function onReviewApproved(): void {
    enterPrewarmingBoot('已确认声线，正在预热触摸台词…', 'create')
  }

  function onReviewDone(): void {
    reviewStatus.value = null
    void finishReady().then(() => options.onConfigRefresh?.())
  }

  function onReviewRegenerating(): void {
    reviewStatus.value = null
    enterGeneratingBoot()
  }

  return {
    phase, message, progress, reviewStatus, errorMessage, status, showBootOverlay, inReview,
    bootSteps, currentStepId, enterGeneratingBoot, enterPrewarmingBoot, enterReview, finishReady,
    evaluateInitialBoot, refreshBootProgress, onReviewApproved, onReviewDone, onReviewRegenerating
  }
}
