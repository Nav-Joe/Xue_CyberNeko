<script setup lang="ts">

import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { VOICE_FORGE_TITLE } from '../constants/voiceForge'
import { loadTtsCapabilities } from '../services/ttsCapabilities'

import AltEngineCorpusSettings from './AltEngineCorpusSettings.vue'

import OfficialTouchPlaybackSettings from './OfficialTouchPlaybackSettings.vue'

import RealtimeInferenceSettings from './RealtimeInferenceSettings.vue'

import VoiceForgePanel from './VoiceForgePanel.vue'



type SettingsPage = 'main' | 'advanced' | 'voice-forge'



const ADVANCED_TITLE = '高级设置'



const emit = defineEmits<{

  back: []

  'layout-change': []

  'upload-flow-active': [active: boolean]

}>()



const page = ref<SettingsPage>('main')

const voiceForgeUploadFlowActive = ref(false)
const voiceForgeSupported = ref(true)
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



function openVoiceForge(): void {
  if (!voiceForgeSupported.value) {
    return
  }
  page.value = 'voice-forge'
}



function goBack(): void {

  if (page.value === 'voice-forge') {

    page.value = 'advanced'

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

  return '设置'

}



async function onDragHandleDown(event: PointerEvent): Promise<void> {

  if (event.button !== 0 || !window.electronAPI?.getPetWindowPosition) {

    return

  }



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

  if (!dragging.value || dragPointerId !== event.pointerId) {

    return

  }



  const dx = event.screenX - dragStartScreen.x

  const dy = event.screenY - dragStartScreen.y

  window.electronAPI?.setPetWindowPosition(

    Math.round(dragStartWindow.x + dx),

    Math.round(dragStartWindow.y + dy)

  )

}



function onDragEnd(event: PointerEvent): void {

  if (dragPointerId !== null && event.pointerId !== dragPointerId) {

    return

  }



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

  <div class="settings" :class="{ 'settings--dragging': dragging, 'settings--upload-flow': voiceForgeUploadFlowActive }">

    <header v-show="!voiceForgeUploadFlowActive" class="header">

      <button type="button" class="back" @click="goBack">← 返回</button>

      <div

        class="header-drag"

        title="按住拖动以移动窗口"

        @pointerdown="onDragHandleDown"

      >

        <h2 class="title">{{ pageTitle() }}</h2>

        <span class="drag-hint" aria-hidden="true">⠿</span>

      </div>

    </header>



    <template v-if="page === 'main'">

      <section class="section">

        <OfficialTouchPlaybackSettings />

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
              ? '扩展功能：触摸实时推理、语料编辑与创造新声线。切换桌宠声线请回家窗口。'
              : '当前运行第三方 TTS 引擎，可使用下方语料预热；Qwen 音色工坊仅在运行 qwen 后端时可用。'
          }}
        </p>

        <p v-if="voiceForgeDisabledHint && !voiceForgeSupported" class="engine-hint">{{ voiceForgeDisabledHint }}</p>
        <p v-else-if="voiceForgeDisabledHint && voiceForgeSupported" class="engine-hint engine-hint--info">
          {{ voiceForgeDisabledHint }}
        </p>

        <RealtimeInferenceSettings :disabled="false" />

        <AltEngineCorpusSettings
          v-if="altEngineCorpusSupported"
          :engine-name="effectiveEngineName"
        />

        <button
          v-if="voiceForgeSupported"
          type="button"
          class="nav-row"
          @click="openVoiceForge"
        >
          <span class="nav-row__body">
            <span class="nav-row__title">{{ VOICE_FORGE_TITLE }}</span>
            <span class="nav-row__desc">更新各声线语料库，或创造新克隆声线</span>
          </span>
          <span class="nav-row__chevron" aria-hidden="true">›</span>
        </button>

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

  padding: 8px;

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

  gap: 8px;

  margin-bottom: 8px;

}



.header-drag {

  min-width: 0;

  flex: 1;

  display: flex;

  align-items: center;

  gap: 8px;

  padding: 2px 6px;

  border-radius: 8px;

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



.back {

  flex-shrink: 0;

  border: none;

  background: transparent;

  color: #6b7280;

  font-size: 13px;

  cursor: pointer;

  padding: 4px 6px;

  border-radius: 6px;

}



.back:hover {

  background: #f3f4f6;

}



.title {

  margin: 0;

  font-size: 15px;

  font-weight: 600;

  color: #111827;

  line-height: 1.3;

  flex: 1;

}



.drag-hint {

  flex-shrink: 0;

  font-size: 14px;

  line-height: 1;

  color: #9ca3af;

  letter-spacing: -2px;

}



.section {

  padding: 8px 6px;

  border-top: 1px solid rgba(0, 0, 0, 0.06);

}



.intro {

  margin: 0 0 12px;

  font-size: 12px;

  line-height: 1.55;

  color: #6b7280;

}



.nav-row {

  display: flex;

  align-items: center;

  gap: 10px;

  width: 100%;

  padding: 12px 14px;

  border: 1px solid rgba(0, 0, 0, 0.06);

  border-radius: 12px;

  background: #fafafa;

  text-align: left;

  cursor: pointer;

  transition: background 0.15s ease, border-color 0.15s ease;

}



.nav-row:hover {

  background: #fdf2f8;

  border-color: rgba(236, 72, 153, 0.18);

}



.nav-row--disabled,
.nav-row--disabled:hover {
  cursor: not-allowed;
  opacity: 0.55;
  background: #f3f4f6;
  border-color: rgba(0, 0, 0, 0.06);
}



.engine-status {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #374151;
  font-size: 11px;
  line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.engine-hint {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff7ed;
  border: 1px solid rgba(251, 146, 60, 0.35);
  color: #9a3412;
  font-size: 12px;
  line-height: 1.55;
}

.engine-hint--info {
  background: #eff6ff;
  border-color: rgba(59, 130, 246, 0.35);
  color: #1d4ed8;
}



.nav-row__body {

  flex: 1;

  min-width: 0;

}



.nav-row__title {

  display: block;

  font-size: 13px;

  font-weight: 600;

  color: #111827;

  line-height: 1.4;

}



.nav-row__desc {

  display: block;

  margin-top: 4px;

  font-size: 12px;

  color: #6b7280;

  line-height: 1.45;

}



.nav-row__chevron {

  flex-shrink: 0;

  font-size: 20px;

  line-height: 1;

  color: #9ca3af;

}

</style>

