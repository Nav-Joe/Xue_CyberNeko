<script setup lang="ts">
import BootScreen from './app/components/BootScreen.vue'
import ErrorBoundary from './app/components/ErrorBoundary.vue'
import PetOverlay from './app/components/PetOverlay.vue'
import ChatBootstrapOverlay from './components/chat/ChatBootstrapOverlay.vue'
import { useAppBoot } from './app/composables/useAppBoot'
import { useOverlayManager } from './app/composables/useOverlayManager'
import { useVoiceEventBus } from './app/composables/useVoiceEventBus'
import { useChatEntry } from './composables/chat/useChatEntry'
import { useScreenCompanionNarrate } from './composables/useScreenCompanionNarrate'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { setRuntimeCorpus } from './services/corpus'
import { setRealtimeInferenceEnabled } from './services/ttsSettings'
import { getTouchFeedbackMode, setTouchFeedbackMode, type TouchFeedbackMode } from './services/touchModeSettings'
import { isVoiceUploadFlowGuardActive } from './services/voiceUploadFlowGuard'
import { syncTouchModeAfterSwitch } from './services/voiceForgeApi'
import {
  expectedTouchModeForLoad,
  waitForVoiceEngineLoad,
  type VoiceEngineLoadMode,
  type VoiceEngineLoadRequest
} from './services/voiceEngineLoading'

const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const petStage = ref({ width: 240, height: 320 })
const engineLoadActive = ref(false)
const engineLoadTitle = ref('加载中')
const engineLoadMessage = ref('请稍候…')
const engineLoadProgress = ref<{ done: number; total: number } | null>(null)

let bootTimer: number | null = null
let unbindVoiceConfigChanged: (() => void) | null = null
let unbindVoiceEngineLoadBegin: (() => void) | null = null
let engineLoadInFlight = false

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

const boot = useAppBoot({
  onConfigRefresh: bootstrapTouchConfig,
  onReady: async () => {
    if (window.electronAPI?.setPetWindowOverlay) {
      await window.electronAPI.setPetWindowOverlay(0, 0, false)
      window.electronAPI.setIgnoreMouseEvents(true)
    }
    await window.electronAPI?.notifyVoiceSamplesChanged?.()
  },
  onEnterReview: () => {
    menuVisible.value = false
  },
  onEnterLoading: () => {
    menuVisible.value = false
  }
})

const { chatBooting, bootTitle, bootMessage, bootProgress, canCancelDownload, cancellingDownload, cancelDownload, openChat } = useChatEntry()

const overlay = useOverlayManager({
  bootPhase: boot.phase,
  showBootOverlay: boot.showBootOverlay,
  engineLoadActive,
  menuVisible,
  reviewStatus: boot.reviewStatus,
  chatBooting
})

const voiceBus = useVoiceEventBus({
  enterGeneratingBoot: boot.enterGeneratingBoot,
  enterReview: boot.enterReview
})

useScreenCompanionNarrate()

const petReady = computed(() => boot.phase.value === 'ready' && !engineLoadActive.value)

async function syncPetWindowForBoot(): Promise<void> {
  if (!window.electronAPI?.setPetWindowOverlay) {
    return
  }

  if (overlay.shouldShrinkToPet.value) {
    await window.electronAPI.setPetWindowOverlay(0, 0, false)
    window.electronAPI.setIgnoreMouseEvents(true)
    return
  }

  window.electronAPI.setIgnoreMouseEvents(false)

  const spec = overlay.activeOverlay.value
  if (spec) {
    await window.electronAPI.setPetWindowOverlay(spec.width, spec.height, true)
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

watch([boot.phase, boot.reviewStatus, menuVisible, engineLoadActive, chatBooting], () => {
  void syncPetWindowForBoot()
})

onMounted(() => {
  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('voice-forge-boot', voiceBus.onVoiceForgeBoot)
  window.addEventListener('voice-upload-review', voiceBus.onVoiceUploadReview)
  window.addEventListener('voice-prewarm-boot', onVoicePrewarmBootEvent)
  unbindVoiceConfigChanged = window.electronAPI?.onVoiceConfigChanged?.((payload) => {
    void onVoiceConfigChanged(payload)
  }) ?? null
  unbindVoiceEngineLoadBegin =
    window.electronAPI?.onVoiceEngineLoadBegin?.((payload) => {
      void runVoiceEngineLoad(payload)
    }) ?? null
  void boot.evaluateInitialBoot()
  bootTimer = window.setInterval(() => {
    void boot.refreshBootProgress()
  }, 1500)
})

onUnmounted(() => {
  window.removeEventListener('blur', handleWindowBlur)
  window.removeEventListener('voice-forge-boot', voiceBus.onVoiceForgeBoot)
  window.removeEventListener('voice-upload-review', voiceBus.onVoiceUploadReview)
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
    <ErrorBoundary :message="boot.errorMessage.value" />

    <BootScreen
      :show-engine-load-overlay="overlay.showEngineLoadOverlay.value"
      :engine-load-title="engineLoadTitle"
      :engine-load-message="engineLoadMessage"
      :engine-load-progress="engineLoadProgress"
      :show-boot-overlay="boot.showBootOverlay.value"
      :boot-steps="boot.bootSteps.value"
      :boot-current-step-id="boot.currentStepId.value"
      :boot-message="boot.message.value"
      :boot-progress="boot.progress.value"
      :boot-phase="boot.phase.value"
      :review-status="boot.reviewStatus.value"
      @approved="boot.onReviewApproved"
      @done="boot.onReviewDone"
      @regenerating="boot.onReviewRegenerating"
    />

    <ChatBootstrapOverlay
      v-if="chatBooting"
      :title="bootTitle"
      :message="bootMessage"
      :progress="bootProgress"
      :show-cancel="canCancelDownload"
      :cancelling="cancellingDownload"
      @cancel="cancelDownload"
    />

    <PetOverlay
      :pet-ready="petReady"
      :pet-stage="petStage"
      :menu-visible="menuVisible"
      :menu-x="menuX"
      :menu-y="menuY"
      :chat-shortcut-disabled="chatBooting"
      @open-menu="openMenu"
      @pet-frame-ready="onPetFrameReady"
      @menu-action="handleMenuAction"
      @close-menu="closeMenu"
      @chat-shortcut-click="openChat({ origin: 'pet' })"
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
</style>
