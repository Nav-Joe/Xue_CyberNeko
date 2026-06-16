<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { Application } from 'pixi.js'
import type { Live2DModel } from 'pixi-live2d-display/cubism4'

const props = withDefaults(
  defineProps<{
    mode?: 'pet' | 'dev'
  }>(),
  { mode: 'pet' }
)

const emit = defineEmits<{
  openMenu: [payload: { x: number; y: number }]
}>()

const MODEL_URL = '/models/Haru/Haru.model3.json'
const CUBISM_CORE_URL = '/live2d/live2dcubismcore.min.js'

const containerRef = ref<HTMLDivElement | null>(null)
const loadError = ref('')
const isLoading = ref(true)

let app: Application | null = null
let model: Live2DModel | null = null
let canvasEl: HTMLCanvasElement | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let baseModelWidth = 0
let baseModelHeight = 0
let lastMouseIgnore: boolean | null = null
let pointerPosition: import('pixi.js').Point | null = null

declare global {
  interface Window {
    Live2DCubismCore?: unknown
  }
}

const isPetMode = () => props.mode === 'pet'

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

  const padding = isPetMode() ? 12 : 48
  const availableWidth = Math.max(app.screen.width - padding * 2, 1)
  const availableHeight = Math.max(app.screen.height - padding * 2, 1)

  const scale =
    Math.min(availableWidth / baseModelWidth, availableHeight / baseModelHeight) *
    (isPetMode() ? 1 : 0.95)

  model.scale.set(scale)
  model.position.set(app.screen.width / 2, app.screen.height / 2)
}

function scheduleLayout(): void {
  if (resizeTimer) {
    clearTimeout(resizeTimer)
  }

  resizeTimer = setTimeout(() => {
    layoutModel()
    resizeTimer = null
  }, 80)
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

  alert('雪澜赛博猫娘\n\n右键菜单开发模式占位')
}

function handleCanvasPointerDown(event: PointerEvent): void {
  if (!model || event.button !== 0) return

  const point = mapPointerToGlobal(event)
  if (!model.containsPoint(point)) return

  model.tap(point.x, point.y)
  console.log('喵')
}

function handleCanvasPointerMove(event: PointerEvent): void {
  if (!model) return

  const point = mapPointerToGlobal(event)
  const onModel = model.containsPoint(point)

  if (onModel) {
    model.focus(point.x, point.y)
  }

  if (isPetMode()) {
    setMouseIgnore(!onModel)
  }
}

function bindCanvasEvents(): void {
  if (!canvasEl) return

  canvasEl.addEventListener('contextmenu', handleContextMenu)
  canvasEl.addEventListener('pointerdown', handleCanvasPointerDown)
  canvasEl.addEventListener('pointermove', handleCanvasPointerMove)
}

function unbindCanvasEvents(): void {
  if (!canvasEl) return

  canvasEl.removeEventListener('contextmenu', handleContextMenu)
  canvasEl.removeEventListener('pointerdown', handleCanvasPointerDown)
  canvasEl.removeEventListener('pointermove', handleCanvasPointerMove)
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

    app = new PIXI.Application({
      backgroundAlpha: 0,
      resizeTo: container,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
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

    resizeObserver = new ResizeObserver(() => {
      scheduleLayout()
    })
    resizeObserver.observe(container)

    model.on('hit', (hitAreas: string[]) => {
      console.log('[Live2D] 点击部位:', hitAreas.join(', '))
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
  void initLive2D()
})

onBeforeUnmount(() => {
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
  <div class="live2d-view" :class="{ 'live2d-view--pet': mode === 'pet' }">
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
