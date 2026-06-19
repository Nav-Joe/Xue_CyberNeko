<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { Application } from 'pixi.js'
import type { Live2DModel } from 'pixi-live2d-display/cubism4'
import { handleModelTap } from '../services/interaction'

const props = withDefaults(
  defineProps<{
    mode?: 'pet' | 'home' | 'dev'
  }>(),
  { mode: 'pet' }
)

const emit = defineEmits<{
  openMenu: [payload: { x: number; y: number }]
}>()

const MODEL_URL = '/models/hiyori_pro/runtime/hiyori_pro_t11.model3.json'
const CUBISM_CORE_URL = '/live2d/live2dcubismcore.min.js'

const containerRef = ref<HTMLDivElement | null>(null)
const loadError = ref('')
const isLoading = ref(true)
const isDragging = ref(false)
const homeVisible = ref(false)

let app: Application | null = null
let model: Live2DModel | null = null
let canvasEl: HTMLCanvasElement | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let baseModelWidth = 0
let baseModelHeight = 0
let lastMouseIgnore: boolean | null = null
let pointerPosition: import('pixi.js').Point | null = null
let unbindHomeListener: (() => void) | null = null

/** 移动超过该像素才视为拖拽，避免与点击「喵」冲突 */
const DRAG_THRESHOLD = 8

let pointerActive = false
let dragStarted = false
let dragStartScreen = { x: 0, y: 0 }
/** 按下时指针在窗口内的偏移，用于 screenX/Y 反算窗口左上角 */
let dragPointerOffset = { x: 0, y: 0 }
let activePointerId: number | null = null
let lastLayoutWidth = 0
let lastLayoutHeight = 0
let lastHitAreas: string[] = []

declare global {
  interface Window {
    Live2DCubismCore?: unknown
  }
}

const isPetMode = () => props.mode === 'pet'
const isHomeMode = () => props.mode === 'home'
const usesFixedCanvas = () => isPetMode()
const canDragPet = () => isPetMode() && !homeVisible.value

function updateCanvasCursor(onModel: boolean): void {
  if (!canvasEl || !isPetMode()) return
  if (isDragging.value) {
    canvasEl.style.cursor = 'grabbing'
  } else if (onModel && canDragPet()) {
    canvasEl.style.cursor = 'grab'
  } else {
    canvasEl.style.cursor = 'default'
  }
}

function loadCubismCore(): Promise<void> {
  if (window.Live2DCubismCore) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CUBISM_CORE_URL}"]`
    )
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Cubism Core 脚本加载失败')),
        { once: true }
      )
      return
    }

    const script = document.createElement('script')
    script.src = CUBISM_CORE_URL
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Cubism Core 脚本加载失败'))
    document.head.appendChild(script)
  })
}

function mapPointerToGlobal(event: PointerEvent): import('pixi.js').Point {
  if (!app || !pointerPosition) {
    throw new Error('Pixi 未初始化')
  }

  const interaction = app.renderer.plugins.interaction
  interaction.mapPositionToPoint(pointerPosition, event.clientX, event.clientY)
  return pointerPosition
}

function isPointerOnModel(event: PointerEvent): boolean {
  if (!model) return false
  return model.containsPoint(mapPointerToGlobal(event))
}

function setMouseIgnore(ignore: boolean): void {
  if (!isPetMode() || !window.electronAPI?.setIgnoreMouseEvents) return
  if (lastMouseIgnore === ignore) return
  lastMouseIgnore = ignore
  window.electronAPI.setIgnoreMouseEvents(ignore)
}

function layoutModel(): void {
  if (!app || !model || baseModelWidth <= 0 || baseModelHeight <= 0) return
  if (dragStarted || isDragging.value) return

  const padding = isPetMode() ? 12 : isHomeMode() ? 8 : 48
  const availableWidth = Math.max(app.screen.width - padding * 2, 1)
  const availableHeight = Math.max(app.screen.height - padding * 2, 1)

  const scaleFactor = isPetMode() ? 1 : isHomeMode() ? 1 : 0.95
  const scale =
    Math.min(availableWidth / baseModelWidth, availableHeight / baseModelHeight) * scaleFactor

  model.scale.set(scale)
  model.position.set(app.screen.width / 2, app.screen.height / 2)
  lastLayoutWidth = app.screen.width
  lastLayoutHeight = app.screen.height
}

function scheduleLayout(width: number, height: number): void {
  if (dragStarted || isDragging.value) return
  if (
    lastLayoutWidth > 0 &&
    Math.abs(width - lastLayoutWidth) < 1 &&
    Math.abs(height - lastLayoutHeight) < 1
  ) {
    return
  }

  if (resizeTimer) {
    clearTimeout(resizeTimer)
  }

  resizeTimer = setTimeout(() => {
    layoutModel()
    resizeTimer = null
  }, 80)
}

function movePetWindowToScreenPoint(screenX: number, screenY: number): void {
  window.electronAPI.setPetWindowPosition(
    Math.round(screenX - dragPointerOffset.x),
    Math.round(screenY - dragPointerOffset.y)
  )
}

function releasePointerCapture(): void {
  if (activePointerId === null || !canvasEl) return

  try {
    canvasEl.releasePointerCapture(activePointerId)
  } catch {
    // 指针已释放时忽略
  }
  activePointerId = null
}

function startIdleMotion(): void {
  if (!model) return

  try {
    model.motion('Idle')
  } catch (error) {
    console.warn('[Live2D] 待机动作启动失败', error)
  }
}

function handleContextMenu(event: MouseEvent): void {
  event.preventDefault()
  if (!isPointerOnModel(event as PointerEvent)) return

  if (isPetMode()) {
    setMouseIgnore(false)
    emit('openMenu', { x: event.clientX, y: event.clientY })
    return
  }

  if (isHomeMode()) {
    event.preventDefault()
    return
  }

  alert('雪澜赛博猫娘\n\n右键菜单开发模式占位')
}

function handleCanvasPointerDown(event: PointerEvent): void {
  if (!model || event.button !== 0) return

  const point = mapPointerToGlobal(event)
  if (!model.containsPoint(point)) return

  pointerActive = true
  dragStarted = false
  dragStartScreen = { x: event.screenX, y: event.screenY }
  dragPointerOffset = { x: event.clientX, y: event.clientY }
  activePointerId = event.pointerId

  if (canDragPet()) {
    canvasEl?.setPointerCapture(event.pointerId)
    setMouseIgnore(false)
  }
}

function handleCanvasPointerMove(event: PointerEvent): void {
  if (!model) return

  const point = mapPointerToGlobal(event)
  const onModel = model.containsPoint(point)

  if (onModel) {
    model.focus(point.x, point.y)
  }

  if (isPetMode()) {
    if (pointerActive && canDragPet()) {
      const dx = event.screenX - dragStartScreen.x
      const dy = event.screenY - dragStartScreen.y

      if (!dragStarted && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        dragStarted = true
        isDragging.value = true
      }

      if (dragStarted) {
        movePetWindowToScreenPoint(event.screenX, event.screenY)
        setMouseIgnore(false)
        updateCanvasCursor(true)
        return
      }
    }

    if (!pointerActive) {
      setMouseIgnore(!onModel)
    }
    updateCanvasCursor(onModel)
  }
}

function handleCanvasPointerUp(event: PointerEvent): void {
  if (!model || !pointerActive) return

  releasePointerCapture()

  const point = mapPointerToGlobal(event)
  const onModel = model.containsPoint(point)

  if (!dragStarted && onModel && event.button === 0) {
    model.tap(point.x, point.y)
    void handleModelTap({
      model,
      pointX: point.x,
      pointY: point.y,
      hitAreas: lastHitAreas.length > 0 ? lastHitAreas : ['Body'],
      isHome: isHomeMode()
    })
  }

  pointerActive = false
  dragStarted = false
  isDragging.value = false
  updateCanvasCursor(onModel)

  if (isPetMode() && !onModel) {
    setMouseIgnore(true)
  }
}

function handleWindowPointerUp(event: PointerEvent): void {
  if (pointerActive) {
    handleCanvasPointerUp(event)
  }
}

function bindCanvasEvents(): void {
  if (!canvasEl) return

  canvasEl.addEventListener('contextmenu', handleContextMenu)
  canvasEl.addEventListener('pointerdown', handleCanvasPointerDown)
  canvasEl.addEventListener('pointermove', handleCanvasPointerMove)
  canvasEl.addEventListener('pointerup', handleCanvasPointerUp)
  canvasEl.addEventListener('pointercancel', handleCanvasPointerUp)
  window.addEventListener('pointerup', handleWindowPointerUp)
}

function unbindCanvasEvents(): void {
  if (!canvasEl) return

  canvasEl.removeEventListener('contextmenu', handleContextMenu)
  canvasEl.removeEventListener('pointerdown', handleCanvasPointerDown)
  canvasEl.removeEventListener('pointermove', handleCanvasPointerMove)
  canvasEl.removeEventListener('pointerup', handleCanvasPointerUp)
  canvasEl.removeEventListener('pointercancel', handleCanvasPointerUp)
  window.removeEventListener('pointerup', handleWindowPointerUp)
}

async function initLive2D(): Promise<void> {
  const container = containerRef.value
  if (!container) return

  try {
    await loadCubismCore()

    if (!window.Live2DCubismCore) {
      throw new Error('Cubism Core 未正确初始化')
    }

    const { ShaderSystem } = await import('@pixi/core')
    const { install: installUnsafeEval } = await import('@pixi/unsafe-eval')
    installUnsafeEval({ ShaderSystem })

    const PIXI = await import('pixi.js')
    const { Live2DModel: Live2DModelClass } = await import('pixi-live2d-display/cubism4')

    pointerPosition = new PIXI.Point()
    Live2DModelClass.registerTicker(PIXI.Ticker)

    const viewWidth = Math.max(container.clientWidth, 1)
    const viewHeight = Math.max(container.clientHeight, 1)

    app = new PIXI.Application({
      width: viewWidth,
      height: viewHeight,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      ...(usesFixedCanvas() ? {} : { resizeTo: container })
    })

    canvasEl = app.view as HTMLCanvasElement
    container.appendChild(canvasEl)

    app.stage.interactive = false
    app.stage.interactiveChildren = false

    model = await Live2DModelClass.from(MODEL_URL, {
      autoInteract: false,
      autoUpdate: true
    })

    baseModelWidth = model.internalModel.width
    baseModelHeight = model.internalModel.height
    model.anchor.set(0.5, 0.5)
    model.interactive = false

    app.stage.addChild(model)
    layoutModel()
    startIdleMotion()
    bindCanvasEvents()

    if (isPetMode()) {
      setMouseIgnore(true)
    }

    if (!usesFixedCanvas()) {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        scheduleLayout(entry.contentRect.width, entry.contentRect.height)
      })
      resizeObserver.observe(container)
    }

    model.on('hit', (hitAreas: string[]) => {
      lastHitAreas = hitAreas
      console.log('[Live2D] HitArea:', hitAreas.join(', '))
    })

    isLoading.value = false
    console.log('[Live2D] 模型加载成功:', model.internalModel.settings.name)
  } catch (error) {
    isLoading.value = false
    loadError.value =
      'Live2D 加载失败。请执行 npm run setup:model 下载模型与 Cubism Core，然后重启 npm run dev。'
    console.error('[Live2D] 初始化失败:', error)
  }
}

onMounted(() => {
  if (isPetMode() && window.electronAPI?.onHomeVisibilityChanged) {
    unbindHomeListener = window.electronAPI.onHomeVisibilityChanged((visible) => {
      homeVisible.value = visible
      if (visible) {
        pointerActive = false
        dragStarted = false
        isDragging.value = false
      }
    })
  }
  void initLive2D()
})

onBeforeUnmount(() => {
  unbindHomeListener?.()
  unbindHomeListener = null
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }

  resizeObserver?.disconnect()
  resizeObserver = null
  unbindCanvasEvents()
  canvasEl = null

  model?.destroy()
  app?.destroy(true, { children: true })
  model = null
  app = null
})
</script>

<template>
  <div
    class="live2d-view"
    :class="{
      'live2d-view--pet': mode === 'pet',
      'live2d-view--home': mode === 'home'
    }"
  >
    <div ref="containerRef" class="live2d-canvas" />

    <div v-if="isLoading" class="overlay">正在唤醒猫娘...</div>
    <p v-if="loadError" class="error">{{ loadError }}</p>
  </div>
</template>

<style scoped>
.live2d-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.live2d-view--pet {
  background: transparent;
}

.live2d-view--home {
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.28);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.45),
    0 12px 40px rgba(15, 23, 42, 0.06);
}

.live2d-canvas {
  width: 100%;
  height: 100%;
}

.live2d-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 14px;
  pointer-events: none;
}

.error {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(254, 226, 226, 0.95);
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.5;
}
</style>
