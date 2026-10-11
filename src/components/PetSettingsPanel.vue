<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { VOICE_FORGE_TITLE } from '../constants/voiceForge'
import { loadTtsCapabilities } from '../services/ttsCapabilities'

import AltEngineCorpusSettings from './AltEngineCorpusSettings.vue'
import ChatScreenCompanionSettings from './chat/ChatScreenCompanionSettings.vue'
import EmotionPluginSettings from './EmotionPluginSettings.vue'
import OfficialTouchPlaybackSettings from './OfficialTouchPlaybackSettings.vue'
import RealtimeInferenceSettings from './RealtimeInferenceSettings.vue'
import VoiceForgePanel from './VoiceForgePanel.vue'

type SettingsPage = 'main' | 'advanced' | 'voice-forge' | 'screen-companion'

const ADVANCED_TITLE = '高级设置'
const SCREEN_COMPANION_TITLE = '屏幕偷窥'

const emit = defineEmits<{
  back: []
  'layout-change': []
  'upload-flow-active': [active: boolean]
}>()

const page = ref<SettingsPage>('main')
const voiceForgeUploadFlowActive = ref(false)
const voiceForgeSupported = ref(true)
const localQwenModelsReady = ref(true)
const voiceForgeDisabledHint = ref('')
const altEngineCorpusSupported = ref(false)
const effectiveEngineName = ref('qwen')
const engineStatusLine = ref('')

const dragging = ref(false)
let dragPointerId: number | null = null
let dragStartScreen = { x: 0, y: 0 }
let dragStartWindow = { x: 0, y: 0 }

function openAdvanced(): void {
  page.value = 'advanced'
}

function openScreenCompanion(): void {
  page.value = 'screen-companion'
}

function openVoiceForge(): void {
  if (!voiceForgeSupported.value) return
  page.value = 'voice-forge'
}

function goBack(): void {
  if (page.value === 'voice-forge') {
    page.value = 'advanced'
    return
  }
  if (page.value === 'screen-companion') {
    page.value = 'main'
    return
  }
  if (page.value === 'advanced') {
    page.value = 'main'
    return
  }
  emit('back')
}

function closeSettingsCompletely(): void {
  page.value = 'main'
  emit('back')
}

const pageTitle = (): string => {
  if (page.value === 'advanced') return ADVANCED_TITLE
  if (page.value === 'voice-forge') return VOICE_FORGE_TITLE
  if (page.value === 'screen-companion') return SCREEN_COMPANION_TITLE
  return '设置'
}

async function onDragHandleDown(event: PointerEvent): Promise<void> {
  if (event.button !== 0 || !window.electronAPI?.getPetWindowPosition) return

  event.preventDefault()
  const handle = event.currentTarget as HTMLElement | null
  handle?.setPointerCapture(event.pointerId)

  dragging.value = true
  dragPointerId = event.pointerId
  dragStartScreen = { x: event.screenX, y: event.screenY }
  const pos = await window.electronAPI.getPetWindowPosition()
  dragStartWindow = { x: pos.x, y: pos.y }

  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(event: PointerEvent): void {
  if (!dragging.value || dragPointerId !== event.pointerId) return

  const dx = event.screenX - dragStartScreen.x
  const dy = event.screenY - dragStartScreen.y
  window.electronAPI?.setPetWindowPosition(
    Math.round(dragStartWindow.x + dx),
    Math.round(dragStartWindow.y + dy)
  )
}

function onDragEnd(event: PointerEvent): void {
  if (dragPointerId !== null && event.pointerId !== dragPointerId) return

  dragging.value = false
  dragPointerId = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

watch(page, () => {
  void nextTick(() => emit('layout-change'))
})

watch(voiceForgeUploadFlowActive, (active) => {
  emit('upload-flow-active', active)
})

function onPetSettingsClose(): void {
  closeSettingsCompletely()
}

onMounted(() => {
  window.addEventListener('pet-settings-close', onPetSettingsClose)
  void loadTtsCapabilities().then((caps) => {
    voiceForgeSupported.value = caps.voiceForgeSupported
    localQwenModelsReady.value = caps.localQwenModelsReady
    voiceForgeDisabledHint.value = caps.hint ?? ''
    altEngineCorpusSupported.value = caps.altEngineCorpusSupported
    effectiveEngineName.value = caps.effectiveEngine
    engineStatusLine.value = caps.engineStatusLine ?? ''
    if (!caps.voiceForgeSupported && page.value === 'voice-forge') {
      page.value = 'advanced'
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('pet-settings-close', onPetSettingsClose)
  onDragEnd(new PointerEvent('pointerup'))
})
</script>

<template>
  <div
    class="settings"
    :class="{ 'settings--dragging': dragging, 'settings--upload-flow': voiceForgeUploadFlowActive }"
  >
    <header v-show="!voiceForgeUploadFlowActive" class="header">
      <button type="button" class="back" @click="goBack">← 返回</button>
      <div class="header-drag" title="按住拖动以移动窗口" @pointerdown="onDragHandleDown">
        <div class="header-text">
          <p class="badge">桌宠设置</p>
          <h2 class="title">{{ pageTitle() }}</h2>
        </div>
        <span class="drag-hint" aria-hidden="true">⠿</span>
      </div>
    </header>

    <template v-if="page === 'main'">
      <section class="section">
        <OfficialTouchPlaybackSettings />
        <EmotionPluginSettings />

        <button type="button" class="nav-row" @click="openScreenCompanion">
          <span class="nav-row__body">
            <span class="nav-row__title">{{ SCREEN_COMPANION_TITLE }}</span>
            <span class="nav-row__desc">屏幕检测配置（目前只支持检测Steam游戏）</span>
          </span>
          <span class="nav-row__chevron" aria-hidden="true">›</span>
        </button>

        <button type="button" class="nav-row" @click="openAdvanced">
          <span class="nav-row__body">
            <span class="nav-row__title">{{ ADVANCED_TITLE }}</span>
            <span class="nav-row__desc">触摸实时推理、音色工坊与其它扩展</span>
          </span>
          <span class="nav-row__chevron" aria-hidden="true">›</span>
        </button>
      </section>
    </template>

    <template v-else-if="page === 'advanced'">
      <section class="section">
        <p v-if="engineStatusLine" class="engine-status">{{ engineStatusLine }}</p>
        <p class="intro">
          {{
            voiceForgeSupported
              ? localQwenModelsReady
                ? '扩展功能：触摸实时推理、语料编辑与创造新声线。切换桌宠声线请回家窗口。'
                : '扩展功能：触摸实时推理与云端音色工坊。未安装本地 Qwen3 模型时不显示本地工坊页。'
              : '当前运行第三方 TTS 引擎，可使用下方语料预热；Qwen 音色工坊仅在配置为 qwen 时可用。'
          }}
        </p>
        <p v-if="voiceForgeDisabledHint && !voiceForgeSupported" class="engine-hint">{{ voiceForgeDisabledHint }}</p>
        <p v-else-if="voiceForgeDisabledHint && voiceForgeSupported" class="engine-hint engine-hint--info">
          {{ voiceForgeDisabledHint }}
        </p>

        <RealtimeInferenceSettings :disabled="false" />
        <AltEngineCorpusSettings v-if="altEngineCorpusSupported" :engine-name="effectiveEngineName" />

        <button v-if="voiceForgeSupported" type="button" class="nav-row" @click="openVoiceForge">
          <span class="nav-row__body">
            <span class="nav-row__title">{{ VOICE_FORGE_TITLE }}</span>
            <span class="nav-row__desc">{{
              localQwenModelsReady
                ? '更新各声线语料库，或创造新克隆声线'
                : '云端创造 / 克隆 / 语料预热（本地页已隐藏）'
            }}</span>
          </span>
          <span class="nav-row__chevron" aria-hidden="true">›</span>
        </button>
      </section>
    </template>

    <template v-else-if="page === 'screen-companion'">
      <section class="section section--companion">
        <ChatScreenCompanionSettings />
      </section>
    </template>

    <VoiceForgePanel
      v-else
      @layout-change="emit('layout-change')"
      @voice-creation-started="closeSettingsCompletely"
      @upload-flow-active="voiceForgeUploadFlowActive = $event"
    />
  </div>
</template>

<style scoped>
.settings {
  box-sizing: border-box;
  width: min(380px, calc(100vw - 28px));
  min-width: 280px;
  max-height: min(520px, calc(100vh - 20px));
  padding: 10px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.settings--dragging {
  user-select: none;
  cursor: grabbing;
}

.settings--upload-flow {
  background: transparent;
  pointer-events: none;
  overflow: hidden;
  padding: 0;
}

.header {
  display: flex;
  align-items: flex-start;
  gap: var(--home-space-1, 8px);
  margin-bottom: var(--home-space-1, 8px);
  padding-bottom: var(--home-space-1, 8px);
  border-bottom: 1px solid rgba(219, 39, 119, 0.12);
}

.header-drag {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: var(--home-radius-control, 16px);
  background: var(--home-color-surface, #fff);
  cursor: grab;
  touch-action: none;
}

.header-drag:active {
  cursor: grabbing;
}

.header-text {
  min-width: 0;
  flex: 1;
}

.badge {
  display: inline-block;
  margin: 0 0 4px;
  padding: 2px 10px;
  border-radius: var(--home-radius-pill, 999px);
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-primary, #9f1239);
  font-size: var(--home-font-meta, 0.8125rem);
  font-weight: 700;
}

.back {
  flex-shrink: 0;
  margin-top: 4px;
  min-height: var(--home-target-sm, 36px);
  padding: 6px 12px;
  border: 1.5px solid var(--home-color-primary, #9f1239);
  border-radius: var(--home-radius-pill, 999px);
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-primary, #9f1239);
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.back:hover {
  background: var(--home-color-accent, #db2777);
  border-color: var(--home-color-accent, #db2777);
  color: var(--home-color-on-accent, #fff);
}

.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--home-color-text, #3f2a33);
  line-height: 1.3;
}

.drag-hint {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
  color: var(--home-color-muted, #5c4150);
  letter-spacing: -2px;
}

.section {
  padding: 10px 4px 4px;
}

.section--companion {
  padding-top: 0;
}

.intro {
  margin: 0 0 12px;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--home-color-muted, #5c4150);
}

.nav-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: var(--home-target, 44px);
  margin: 0 0 10px;
  padding: 12px 14px;
  border: 1px solid var(--home-accent-soft, rgba(219, 39, 119, 0.16));
  border-radius: var(--home-radius-control, 16px);
  background: var(--home-color-panel, #fff);
  text-align: left;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(159, 18, 57, 0.06);
  transition:
    background var(--home-motion, 220ms) var(--home-ease, ease),
    border-color var(--home-motion, 220ms) var(--home-ease, ease),
    transform var(--home-motion, 220ms) var(--home-ease, ease);
}

.nav-row:hover {
  background: var(--home-color-chip, #fde8f0);
  border-color: var(--home-color-accent, #db2777);
  transform: translateY(-1px);
}

.nav-row--disabled,
.nav-row--disabled:hover {
  cursor: not-allowed;
  opacity: 0.55;
  background: var(--home-color-chip, #fde8f0);
  border-color: var(--home-line, rgba(63, 42, 51, 0.12));
  transform: none;
  box-shadow: none;
}

.engine-status {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-text, #3f2a33);
  font-size: 11px;
  line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.engine-hint {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: var(--home-radius-control, 16px);
  background: var(--home-color-warning-bg, #fff7ed);
  border: 1px solid var(--home-color-warning-line, rgba(251, 146, 60, 0.35));
  color: var(--home-color-warning, #9a3412);
  font-size: 0.8125rem;
  line-height: 1.55;
}

.engine-hint--info {
  background: var(--home-color-chip, #fde8f0);
  border-color: var(--home-accent-soft, rgba(219, 39, 119, 0.16));
  color: var(--home-color-primary, #9f1239);
}

.nav-row__body {
  flex: 1;
  min-width: 0;
}

.nav-row__title {
  display: block;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--home-color-text, #3f2a33);
  line-height: 1.4;
}

.nav-row__desc {
  display: block;
  margin-top: 4px;
  font-size: 0.8125rem;
  color: var(--home-color-muted, #5c4150);
  line-height: 1.45;
}

.nav-row__chevron {
  flex-shrink: 0;
  font-size: 20px;
  line-height: 1;
  color: var(--home-color-accent, #db2777);
}

:global(.pet-panel[data-appearance='dark']) .nav-row {
  box-shadow: none;
}
</style>
