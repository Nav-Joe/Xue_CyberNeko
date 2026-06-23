<script setup lang="ts">

import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import PetSettingsPanel from './PetSettingsPanel.vue'

import { clampMenuPosition } from '../utils/menuPosition'



const props = defineProps<{

  x: number

  y: number

}>()



const emit = defineEmits<{

  action: [action: 'home' | 'quit']

  close: []

}>()



const showSettings = ref(false)

const menuRef = ref<HTMLElement | null>(null)

const pos = ref({ x: props.x, y: props.y })

const uploadFlowActive = ref(false)



const OVERLAY_PADDING = 8

const UPLOAD_FLOW_OVERLAY_WIDTH = 360

const UPLOAD_FLOW_OVERLAY_HEIGHT = 560

let resizeObserver: ResizeObserver | null = null

let resizeTimer: number | null = null

let layoutSyncing = false



function openSettings(): void {

  showSettings.value = true

}



function closeSettings(): void {

  showSettings.value = false

}



async function syncWindowOverlay(contentWidth: number, contentHeight: number): Promise<void> {

  if (!window.electronAPI?.setPetWindowOverlay) return



  const neededWidth = contentWidth + OVERLAY_PADDING

  const neededHeight = contentHeight + OVERLAY_PADDING

  await window.electronAPI.setPetWindowOverlay(neededWidth, neededHeight)

}



async function syncUploadFlowOverlay(): Promise<void> {

  if (!window.electronAPI?.setPetWindowOverlay) return

  await window.electronAPI.setPetWindowOverlay(

    UPLOAD_FLOW_OVERLAY_WIDTH,

    UPLOAD_FLOW_OVERLAY_HEIGHT,

    true

  )

}



function onUploadFlowActive(active: boolean): void {

  uploadFlowActive.value = active

  if (active) {

    void syncUploadFlowOverlay()

    return

  }

  scheduleLayoutSync()

}



async function updateMenuPosition(): Promise<void> {

  if (layoutSyncing) return

  layoutSyncing = true



  try {

    if (uploadFlowActive.value) {

      await syncUploadFlowOverlay()

      return

    }

    await nextTick()

    const el = menuRef.value

    if (!el) return



    const menuWidth = el.offsetWidth

    const menuHeight = el.offsetHeight



    await syncWindowOverlay(props.x + menuWidth, props.y + menuHeight)

    await nextTick()



    pos.value = clampMenuPosition(props.x, props.y, menuWidth, menuHeight, OVERLAY_PADDING)



    await syncWindowOverlay(pos.value.x + menuWidth, pos.value.y + menuHeight)

  } finally {

    layoutSyncing = false

  }

}



function scheduleLayoutSync(): void {

  if (uploadFlowActive.value) {

    void syncUploadFlowOverlay()

    return

  }

  if (resizeTimer !== null) {

    window.clearTimeout(resizeTimer)

  }

  resizeTimer = window.setTimeout(() => {

    resizeTimer = null

    void updateMenuPosition()

  }, 16)

}



function attachResizeObserver(): void {

  detachResizeObserver()

  const el = menuRef.value

  if (!el || typeof ResizeObserver === 'undefined') return



  resizeObserver = new ResizeObserver(() => {

    scheduleLayoutSync()

  })

  resizeObserver.observe(el)

}



function detachResizeObserver(): void {

  resizeObserver?.disconnect()

  resizeObserver = null

  if (resizeTimer !== null) {

    window.clearTimeout(resizeTimer)

    resizeTimer = null

  }

}



watch(menuRef, (el, prev) => {

  if (prev) detachResizeObserver()

  if (el) attachResizeObserver()

})



watch(

  () => [props.x, props.y, showSettings.value] as const,

  () => {

    scheduleLayoutSync()

  },

  { immediate: true }

)



onBeforeUnmount(() => {

  detachResizeObserver()

  void window.electronAPI?.setPetWindowOverlay?.(0, 0)

})

</script>



<template>

  <nav

    ref="menuRef"

    class="menu"

    :class="{ 'menu--upload-flow': uploadFlowActive }"

    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"

    @click.stop

  >

    <PetSettingsPanel

      v-if="showSettings"

      @back="closeSettings"

      @layout-change="scheduleLayoutSync"

      @upload-flow-active="onUploadFlowActive"

    />

    <template v-else>

      <button type="button" class="item" @click="emit('action', 'home')">🏠 回家</button>

      <button type="button" class="item" @click="openSettings">⚙️ 设置</button>

      <button type="button" class="item danger" @click="emit('action', 'quit')">退出</button>

    </template>

  </nav>

</template>



<style scoped>

.menu {

  position: fixed;

  z-index: 100;

  min-width: 160px;

  max-width: calc(100vw - 16px);

  padding: 6px;

  border-radius: 14px;

  background: rgba(255, 255, 255, 0.98);

  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.22);

  border: 1px solid rgba(0, 0, 0, 0.08);

  backdrop-filter: blur(16px);

  box-sizing: border-box;

}



.menu--upload-flow {

  min-width: 0;

  width: 0;

  height: 0;

  padding: 0;

  margin: 0;

  border: none;

  border-radius: 0;

  background: transparent;

  box-shadow: none;

  backdrop-filter: none;

  overflow: visible;

  pointer-events: none;

}



.item {

  display: block;

  width: 100%;

  padding: 10px 14px;

  border: none;

  border-radius: 8px;

  background: transparent;

  color: #1f2937;

  font-size: 14px;

  text-align: left;

  cursor: pointer;

}



.item:hover:not(:disabled) {

  background: #fdf2f8;

}



.item.danger {

  color: #b91c1c;

}



.item.danger:hover {

  background: #fef2f2;

}

</style>

