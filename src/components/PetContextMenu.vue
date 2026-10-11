<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import PetSettingsPanel from './PetSettingsPanel.vue'
import { useHomeAppearance } from '../composables/useHomeAppearance'
import { clampMenuPosition } from '../utils/menuPosition'

import '../styles/neko-tokens.css'
import './pet-panel-theme.css'

const props = defineProps<{
  x: number
  y: number
}>()

const emit = defineEmits<{
  action: [action: 'home' | 'quit']
  close: []
}>()

const { appearance } = useHomeAppearance()
const showSettings = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const homeBtnRef = ref<HTMLButtonElement | null>(null)
const pos = ref({ x: props.x, y: props.y })
const uploadFlowActive = ref(false)

const OVERLAY_PADDING = 8
const UPLOAD_FLOW_OVERLAY_WIDTH = 360
const UPLOAD_FLOW_OVERLAY_HEIGHT = 560
let resizeObserver: ResizeObserver | null = null
let resizeTimer: number | null = null
let layoutSyncing = false
/** 打开菜单前的焦点，关闭时尽量还回去（画布常不可聚焦则忽略） */
let previousFocus: HTMLElement | null = null

function openSettings(): void {
  showSettings.value = true
}

function closeSettings(): void {
  showSettings.value = false
  void nextTick(() => focusFirstItem())
}

function focusFirstItem(): void {
  const root = menuRef.value
  if (!root) return
  const target =
    homeBtnRef.value ??
    (root.querySelector(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) as HTMLElement | null)
  target?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  if (showSettings.value) {
    closeSettings()
    return
  }
  emit('close')
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

onMounted(() => {
  const active = document.activeElement
  previousFocus = active instanceof HTMLElement ? active : null
  window.addEventListener('keydown', onKeydown, true)
  void nextTick(() => focusFirstItem())
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  detachResizeObserver()
  void window.electronAPI?.setPetWindowOverlay?.(0, 0)
  if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
    previousFocus.focus()
  }
})
</script>

<template>
  <nav
    ref="menuRef"
    class="menu pet-panel neko-ui"
    :class="{ 'menu--upload-flow': uploadFlowActive }"
    :data-appearance="appearance"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    :role="showSettings ? 'dialog' : 'menu'"
    :aria-label="showSettings ? '桌宠设置' : '桌宠菜单'"
    @click.stop
  >
    <PetSettingsPanel
      v-if="showSettings"
      @back="closeSettings"
      @layout-change="scheduleLayoutSync"
      @upload-flow-active="onUploadFlowActive"
    />
    <template v-else>
      <p class="menu__badge">雪澜</p>
      <button
        ref="homeBtnRef"
        type="button"
        class="item item--primary"
        role="menuitem"
        @click="emit('action', 'home')"
      >
        🏠 回家
      </button>
      <button type="button" class="item" role="menuitem" @click="openSettings">设置</button>
      <div class="menu__sep" role="separator" aria-hidden="true" />
      <button type="button" class="item item--danger" role="menuitem" @click="emit('action', 'quit')">
        退出
      </button>
    </template>
  </nav>
</template>

<style scoped>
.menu {
  position: fixed;
  z-index: 100;
  min-width: 176px;
  max-width: calc(100vw - 16px);
  padding: 10px;
  border-radius: var(--home-radius-card, 24px);
  background: var(--home-color-panel, #fff);
  box-shadow: var(--home-shadow, 0 16px 32px rgba(63, 42, 51, 0.12));
  border: 1px solid var(--home-accent-soft, rgba(219, 39, 119, 0.16));
  backdrop-filter: blur(16px);
  box-sizing: border-box;
}

.menu[data-appearance='dark'] {
  border-color: var(--home-line);
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

.menu__badge {
  display: inline-block;
  margin: 0 0 8px 4px;
  padding: 2px 10px;
  border-radius: var(--home-radius-pill, 999px);
  border: 1.5px solid var(--home-color-accent, #db2777);
  background: transparent;
  color: var(--home-color-primary, #9f1239);
  font-size: var(--home-font-meta, 0.8125rem);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.menu__sep {
  height: 1px;
  margin: 6px 8px;
  background: var(--home-line, rgba(63, 42, 51, 0.12));
}

.item {
  display: block;
  width: 100%;
  min-height: var(--home-target, 44px);
  margin: 0 0 4px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: var(--home-radius-pill, 999px);
  background: transparent;
  color: var(--home-color-text, #3f2a33);
  font-size: 0.875rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.item:last-child {
  margin-bottom: 0;
}

.item:hover:not(:disabled) {
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-primary, #9f1239);
}

.item--primary {
  background: var(--home-color-accent, #db2777);
  color: var(--home-color-on-accent, #fff);
  border-color: transparent;
  box-shadow: 0 6px 14px rgba(219, 39, 119, 0.22);
}

.item--primary:hover:not(:disabled) {
  filter: brightness(1.05);
  color: var(--home-color-on-accent, #fff);
  background: var(--home-color-accent, #db2777);
}

.item--danger {
  color: var(--home-color-danger, #b91c1c);
}

.item--danger:hover {
  background: rgba(185, 28, 28, 0.08);
  color: var(--home-color-danger, #b91c1c);
}
</style>
