<script setup lang="ts">
import Live2DView from './components/Live2DView.vue'
import PetBootOverlay from './components/PetBootOverlay.vue'
import VoiceEngineLoadingOverlay from './components/VoiceEngineLoadingOverlay.vue'
import PetContextMenu from './components/PetContextMenu.vue'
import VoiceForgeReviewDialog from './components/VoiceForgeReviewDialog.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  CORPUS_PREWARM_BOOT_STEPS,
  VOICE_CREATE_BOOT_STEPS,
  type BootStep
} from './constants/petBoot'
import { fetchCacheStatus } from './services/audioCache'
import {
  fetchTtsHealth,
  fetchVoiceForgeStatus,
  resumeVoiceForgeCreation,
  syncTouchModeAfterSwitch,
  type VoiceForgeStatus
} from './services/voiceForgeApi'
import {
  expectedTouchModeForLoad,
  waitForVoiceEngineLoad,
  type VoiceEngineLoadMode,
  type VoiceEngineLoadRequest
} from './services/voiceEngineLoading'
import { setRuntimeCorpus } from './services/corpus'
import { setRealtimeInferenceEnabled } from './services/ttsSettings'
import { getTouchFeedbackMode, setTouchFeedbackMode, type TouchFeedbackMode } from './services/touchModeSettings'
import { isVoiceUploadFlowGuardActive } from './services/voiceUploadFlowGuard'
import { loadTtsCapabilities } from './services/ttsCapabilities'

type BootPhase = 'checking' | 'generating' | 'review' | 'prewarming' | 'ready'
type BootFlow = 'create' | 'corpus' | null

const BOOT_OVERLAY_WIDTH = 360
const BOOT_OVERLAY_HEIGHT = 300
const ENGINE_LOAD_OVERLAY_WIDTH = 360
const ENGINE_LOAD_OVERLAY_HEIGHT = 260
const REVIEW_OVERLAY_WIDTH = 360
const REVIEW_OVERLAY_HEIGHT = 520

const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const petStage = ref({ width: 240, height: 320 })
const bootPhase = ref<BootPhase>('checking')
const bootFlow = ref<BootFlow>(null)
const bootMessage = ref('正在检查语音服务…')
const bootProgress = ref<{ done: number; total: number } | null>(null)
const reviewStatus = ref<VoiceForgeStatus | null>(null)
const engineLoadActive = ref(false)
const engineLoadTitle = ref('加载中')
const engineLoadMessage = ref('请稍候…')
const engineLoadProgress = ref<{ done: number; total: number } | null>(null)

const petReady = computed(() => bootPhase.value === 'ready' && !engineLoadActive.value)
const showBootOverlay = computed(
  () =>
    bootPhase.value === 'checking' ||
    bootPhase.value === 'generating' ||
    bootPhase.value === 'prewarming'
)
const showEngineLoadOverlay = computed(() => engineLoadActive.value)

const bootSteps = computed((): BootStep[] => {
  if (bootFlow.value === 'corpus') {
    return CORPUS_PREWARM_BOOT_STEPS
  }
  return VOICE_CREATE_BOOT_STEPS
})

const bootCurrentStepId = computed((): string => {
  if (bootPhase.value === 'generating') {
    return 'generating'
  }
  if (bootPhase.value === 'review') {
    return 'review'
  }
  if (bootPhase.value === 'prewarming') {
    return 'prewarming'
  }
  if (bootPhase.value === 'ready') {
    return 'ready'
  }
  return bootSteps.value[0]?.id ?? 'ready'
})

let bootTimer: number | null = null
let unbindVoiceConfigChanged: (() => void) | null = null
let unbindVoiceEngineLoadBegin: (() => void) | null = null
let engineLoadInFlight = false

async function syncPetWindowForBoot(): Promise<void> {
  if (!window.electronAPI?.setPetWindowOverlay) {
    return
  }

  if (bootPhase.value === 'ready' && !menuVisible.value && !reviewStatus.value && !engineLoadActive.value) {
    await window.electronAPI.setPetWindowOverlay(0, 0, false)
    window.electronAPI.setIgnoreMouseEvents(true)
    return
  }

  window.electronAPI.setIgnoreMouseEvents(false)

  if (bootPhase.value === 'review') {
    await window.electronAPI.setPetWindowOverlay(REVIEW_OVERLAY_WIDTH, REVIEW_OVERLAY_HEIGHT, true)
    return
  }

  if (showEngineLoadOverlay.value) {
    await window.electronAPI.setPetWindowOverlay(
      ENGINE_LOAD_OVERLAY_WIDTH,
      ENGINE_LOAD_OVERLAY_HEIGHT,
      true
    )
    return
  }

  if (showBootOverlay.value) {
    await window.electronAPI.setPetWindowOverlay(BOOT_OVERLAY_WIDTH, BOOT_OVERLAY_HEIGHT, true)
  }
}

function openMenu(payload: { x: number; y: number }): void {
  if (!petReady.value) {
    return
  }
  menuX.value = payload.x
  menuY.value = payload.y
  menuVisible.value = true
  window.electronAPI.setIgnoreMouseEvents(false)
}

function closeMenu(): void {
  if (!menuVisible.value) return
  menuVisible.value = false
  void syncPetWindowForBoot()
}

function handleMenuAction(action: 'home' | 'quit'): void {
  closeMenu()
  if (action === 'home') {
    window.electronAPI.openHome()
  } else if (action === 'quit') {
    window.electronAPI.quitApp()
  }
}

function onPetFrameReady(payload: { width: number; height: number }): void {
  petStage.value = payload
}

function handleWindowBlur(): void {
  if (isVoiceUploadFlowGuardActive()) {
    return
  }
  if (menuVisible.value) {
    closeMenu()
  }
}

async function bootstrapTouchConfig(): Promise<void> {
  if (!window.electronAPI?.readVoiceForgeConfig) return
  try {
    const config = await window.electronAPI.readVoiceForgeConfig()
    setTouchFeedbackMode(config.mode)
    if (config.mode === 'custom_corpus' || config.mode === 'alt_engine_corpus') {
      setRuntimeCorpus(config.corpus)
    }
    if (window.electronAPI.readRealtimeInferenceFlag) {
      const flag = await window.electronAPI.readRealtimeInferenceFlag()
      setRealtimeInferenceEnabled(flag.enabled)
    }
  } catch (error) {
    console.warn('[PetApp] 读取触摸配置失败', error)
  }
}

function enterGeneratingBoot(): void {
  bootFlow.value = 'create'
  bootPhase.value = 'generating'
  bootMessage.value = '正在生成克隆参考音（VoiceDesign 可能需要数分钟）…'
  bootProgress.value = null
  reviewStatus.value = null
  menuVisible.value = false
}

function enterPrewarmingBoot(message = '正在预热触摸台词…', flow: BootFlow = 'create'): void {
  bootFlow.value = flow
  bootPhase.value = 'prewarming'
  bootMessage.value = message
  reviewStatus.value = null
  menuVisible.value = false
}

function resolveLoadMode(payload: {
  touchMode: TouchFeedbackMode
  loadMode?: VoiceEngineLoadMode
  prewarm?: boolean
}): VoiceEngineLoadMode {
  if (payload.loadMode) {
    return payload.loadMode
  }
  if (payload.touchMode === 'curated') {
    return 'curated'
  }
  return payload.prewarm ? 'prewarm' : 'engine'
}

async function runVoiceEngineLoad(options: VoiceEngineLoadRequest): Promise<boolean> {
  if (engineLoadInFlight) {
    window.electronAPI?.notifyVoiceEngineLoadFinished?.({ ok: false })
    return false
  }

  engineLoadInFlight = true
  engineLoadActive.value = true
  engineLoadTitle.value = options.title
  engineLoadMessage.value = options.message
  engineLoadProgress.value = null
  menuVisible.value = false

  let success = false
  const expectedTouchMode = options.expectedTouchMode ?? expectedTouchModeForLoad(options.mode)
  try {
    if (options.sync !== false) {
      let synced = await syncTouchModeAfterSwitch()
      if (!synced.ok) {
        engineLoadMessage.value = 'TTS 未能同步，请确认 TTS 窗口正在运行'
        return false
      }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (!synced.touch_mode || synced.touch_mode === expectedTouchMode) {
          break
        }
        await new Promise((resolve) => window.setTimeout(resolve, 400))
        synced = await syncTouchModeAfterSwitch()
        if (!synced.ok) {
          engineLoadMessage.value = 'TTS 未能同步，请确认 TTS 窗口正在运行'
          return false
        }
      }
    }

    success = await waitForVoiceEngineLoad(
      options.mode,
      ({ message, progress }) => {
        engineLoadMessage.value = message
        engineLoadProgress.value = progress
      },
      expectedTouchMode,
      options.syncMessage
    )

    if (success) {
      await bootstrapTouchConfig()
    } else {
      engineLoadMessage.value = '加载超时，请确认 TTS 窗口正在运行后重试'
    }

    return success
  } finally {
    engineLoadActive.value = false
    engineLoadInFlight = false
    engineLoadProgress.value = null
    window.electronAPI?.notifyVoiceEngineLoadFinished?.({ ok: success })
    void syncPetWindowForBoot()
  }
}

function finishBootReady(): void {
  bootFlow.value = null
  bootProgress.value = null
  reviewStatus.value = null
  void (async () => {
    if (window.electronAPI?.setPetWindowOverlay) {
      await window.electronAPI.setPetWindowOverlay(0, 0, false)
      window.electronAPI.setIgnoreMouseEvents(true)
    }
    bootPhase.value = 'ready'
    await window.electronAPI?.notifyVoiceSamplesChanged?.()
  })()
}

async function evaluateInitialBoot(): Promise<void> {
  await bootstrapTouchConfig()
  const caps = await loadTtsCapabilities()
  const touchMode = getTouchFeedbackMode()

  if (!caps.voiceForgeSupported) {
    if (getTouchFeedbackMode() === 'alt_engine_corpus') {
      const cache = await fetchCacheStatus()
      if (cache?.building) {
        enterPrewarmingBoot(undefined, 'corpus')
        return
      }
    }
    finishBootReady()
    return
  }

  const status = await fetchVoiceForgeStatus()

  if (!status) {
    finishBootReady()
    return
  }

  if (status.flow === 'create_voice') {
    if (status.phase === 'pending_restart' || status.phase === 'generating') {
      enterGeneratingBoot()
      if (!status.reference_ready) {
        await resumeVoiceForgeCreation()
      }
      return
    }
    if (status.phase === 'prewarming') {
      enterPrewarmingBoot()
      return
    }
    if (status.review_pending && status.reference_ready) {
      bootFlow.value = 'create'
      bootPhase.value = 'review'
      reviewStatus.value = status
      return
    }
  }

  if (touchMode === 'curated') {
    finishBootReady()
    return
  }

  const cache = await fetchCacheStatus()
  // TTS 启动时会同步完成预热；仅在实际构建中或缓存已就绪时区分状态，避免误判重复预热
  if (cache?.building) {
    enterPrewarmingBoot(undefined, 'corpus')
    return
  }

  if (cache?.ready) {
    finishBootReady()
    return
  }

  // 磁盘缓存有效但引擎尚未挂载：直接放出桌宠，触摸时会走 TTS 实时合成或稍后缓存
  finishBootReady()
}

async function refreshBootProgress(): Promise<void> {
  if (bootPhase.value === 'ready' || bootPhase.value === 'checking') {
    return
  }

  // 试听确认阶段无需轮询 TTS，等用户操作即可
  if (bootPhase.value === 'review') {
    return
  }

  const status = await fetchVoiceForgeStatus()

  if (bootPhase.value === 'generating') {
    if (status?.review_pending && status.reference_ready) {
      bootPhase.value = 'review'
      reviewStatus.value = status
    }
    return
  }

  if (bootPhase.value === 'prewarming') {
    const [cache, health] = await Promise.all([fetchCacheStatus(), fetchTtsHealth()])
    const prewarmStillRunning = Boolean(
      health?.sync_running ||
        health?.prewarm_active ||
        cache?.prewarm_active ||
        cache?.building
    )

    if (cache?.building && cache.progress.total > 0) {
      bootProgress.value = cache.progress
      bootMessage.value = `正在预热触摸台词 ${cache.progress.done}/${cache.progress.total}…`
    } else if (cache?.message?.includes('正在预热语料库')) {
      bootMessage.value = cache.message
      bootProgress.value = null
    } else if (prewarmStillRunning) {
      bootMessage.value = '正在预热语料库喵~'
      bootProgress.value = null
    } else {
      bootProgress.value = null
    }

    const sessionDone =
      !status?.flow || status.phase === 'completed' || status.phase === 'cancelled'

    const cacheReady = Boolean(cache?.ready && !cache?.building && !cache?.stale && !prewarmStillRunning)
    const cacheSkipped = Boolean(
      cache?.message && !cache?.building && !cache?.stale && !prewarmStillRunning
    )

    if (sessionDone && (cacheReady || cacheSkipped || getTouchFeedbackMode() === 'curated')) {
      finishBootReady()
      await bootstrapTouchConfig()
      return
    }

    if (status?.phase === 'prewarming' && cacheReady) {
      finishBootReady()
      await bootstrapTouchConfig()
      return
    }

    if (
      sessionDone &&
      getTouchFeedbackMode() === 'custom_corpus' &&
      cache?.touch_mode === 'curated' &&
      !cache?.building
    ) {
      console.warn('[PetApp] 语料预热未能启动，已退出等待')
      finishBootReady()
      await bootstrapTouchConfig()
    }
  }
}

function onReviewApproved(): void {
  enterPrewarmingBoot('已确认声线，正在预热触摸台词…', 'create')
}

function onReviewDone(): void {
  reviewStatus.value = null
  finishBootReady()
  void bootstrapTouchConfig()
}

function onReviewRegenerating(): void {
  reviewStatus.value = null
  enterGeneratingBoot()
}

function onVoiceForgeBootEvent(): void {
  enterGeneratingBoot()
}

function onVoiceUploadReviewEvent(): void {
  void (async () => {
    const status = await fetchVoiceForgeStatus()
    if (!status?.review_pending) {
      return
    }
    bootFlow.value = 'create'
    bootPhase.value = 'review'
    reviewStatus.value = status
    menuVisible.value = false
  })()
}

function onVoicePrewarmBootEvent(): void {
  void runVoiceEngineLoad({
    title: '更新语料库',
    message: '正在预热语料库喵~',
    mode: 'prewarm'
  })
}

async function onVoiceConfigChanged(payload: {
  touchMode: TouchFeedbackMode
  loadMode?: VoiceEngineLoadMode
  prewarm?: boolean
}): Promise<void> {
  setTouchFeedbackMode(payload.touchMode)
  await bootstrapTouchConfig()

  const loadMode = resolveLoadMode(payload)
  const title = loadMode === 'curated' ? '切换精选音频' : '切换音色'
  const message =
    loadMode === 'curated'
      ? '正在切换为精选触摸音频…'
      : loadMode === 'prewarm'
        ? '正在预热语料库喵~'
        : '正在切换音色喵~'

  await runVoiceEngineLoad({ title, message, mode: loadMode })
}

watch([bootPhase, reviewStatus, menuVisible, engineLoadActive], () => {
  void syncPetWindowForBoot()
})

onMounted(() => {
  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('voice-forge-boot', onVoiceForgeBootEvent)
  window.addEventListener('voice-upload-review', onVoiceUploadReviewEvent)
  window.addEventListener('voice-prewarm-boot', onVoicePrewarmBootEvent)
  unbindVoiceConfigChanged = window.electronAPI?.onVoiceConfigChanged?.((payload) => {
    void onVoiceConfigChanged(payload)
  }) ?? null
  unbindVoiceEngineLoadBegin =
    window.electronAPI?.onVoiceEngineLoadBegin?.((payload) => {
      void runVoiceEngineLoad(payload)
    }) ?? null
  void evaluateInitialBoot()
  bootTimer = window.setInterval(() => {
    void refreshBootProgress()
  }, 1500)
})

onUnmounted(() => {
  window.removeEventListener('blur', handleWindowBlur)
  window.removeEventListener('voice-forge-boot', onVoiceForgeBootEvent)
  window.removeEventListener('voice-upload-review', onVoiceUploadReviewEvent)
  window.removeEventListener('voice-prewarm-boot', onVoicePrewarmBootEvent)
  unbindVoiceConfigChanged?.()
  unbindVoiceEngineLoadBegin?.()
  if (bootTimer !== null) {
    window.clearInterval(bootTimer)
  }
})
</script>

<template>
  <div class="pet-root">
    <VoiceEngineLoadingOverlay
      v-if="showEngineLoadOverlay"
      :title="engineLoadTitle"
      :message="engineLoadMessage"
      :progress="engineLoadProgress"
    />

    <PetBootOverlay
      v-else-if="showBootOverlay"
      :steps="bootSteps"
      :current-step-id="bootCurrentStepId"
      :message="bootMessage"
      :progress="bootProgress"
    />

    <div
      v-if="petReady"
      class="pet-stage"
      :style="{ width: `${petStage.width}px`, height: `${petStage.height}px` }"
    >
      <Live2DView
        mode="pet"
        :interaction-locked="menuVisible || !petReady"
        @open-menu="openMenu"
        @pet-frame-ready="onPetFrameReady"
      />
    </div>

    <div
      v-if="menuVisible"
      class="menu-dismiss-layer"
      aria-hidden="true"
      @click="closeMenu"
    />

    <PetContextMenu
      v-if="menuVisible"
      :x="menuX"
      :y="menuY"
      @action="handleMenuAction"
      @close="closeMenu"
    />

    <VoiceForgeReviewDialog
      v-if="bootPhase === 'review' && reviewStatus"
      :status="reviewStatus"
      @approved="onReviewApproved"
      @done="onReviewDone"
      @regenerating="onReviewRegenerating"
    />
  </div>
</template>

<style scoped>
.pet-root {
  position: relative;
  width: 100%;
  height: 100%;
  background: transparent;
}

.pet-stage {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  overflow: hidden;
}

.menu-dismiss-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: transparent;
  cursor: default;
}
</style>
