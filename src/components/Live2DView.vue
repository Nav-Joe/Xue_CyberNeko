<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { Application } from 'pixi.js'
import type { Live2DModel } from 'pixi-live2d-display/cubism4'

const MODEL_URL = '/models/Haru/Haru.model3.json'
const CUBISM_CORE_URL = '/live2d/live2dcubismcore.min.js'

const containerRef = ref<HTMLDivElement | null>(null)
const loadError = ref('')
const isLoading = ref(true)

let app: Application | null = null
let model: Live2DModel | null = null
let resizeHandler: (() => void) | null = null

declare global {
  interface Window {
    Live2DCubismCore?: unknown
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

function layoutModel(): void {
  if (!app || !model) return

  const padding = 48
  const availableWidth = app.screen.width - padding * 2
  const availableHeight = app.screen.height - padding * 2
  const scale = Math.min(availableWidth / model.width, availableHeight / model.height) * 0.95

  model.scale.set(scale)
  model.position.set(app.screen.width / 2, app.screen.height / 2)
  model.anchor.set(0.5, 0.5)
}

function startIdleMotion(): void {
  if (!model) return

  try {
    model.motion('Idle')
  } catch (error) {
    console.warn('[Live2D] 待机动作启动失败，模型将保持静态呼吸动画', error)
  }
}

function handleContextMenu(event: MouseEvent): void {
  event.preventDefault()
  if (!app || !model) return

  const bounds = model.getBounds()
  const point = app.renderer.plugins.interaction.mouse.global

  if (bounds.contains(point.x, point.y)) {
    alert('雪澜赛博猫娘\n\n· 设置（里程碑 7）\n· 聊天（里程碑 3）\n\n右键菜单占位，后续会换成正式 UI')
  }
}

function handlePointerTap(): void {
  console.log('喵')
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

    Live2DModelClass.registerTicker(PIXI.Ticker)

    app = new PIXI.Application({
      backgroundAlpha: 0,
      resizeTo: container,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    })

    container.appendChild(app.view as HTMLCanvasElement)
    ;(app.view as HTMLCanvasElement).addEventListener('contextmenu', handleContextMenu)

    model = await Live2DModelClass.from(MODEL_URL, {
      autoInteract: true,
      autoUpdate: true
    })

    app.stage.addChild(model)
    layoutModel()
    startIdleMotion()

    resizeHandler = layoutModel
    app.renderer.on('resize', resizeHandler)

    model.on('pointertap', handlePointerTap)
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
  if (app?.view) {
    ;(app.view as HTMLCanvasElement).removeEventListener('contextmenu', handleContextMenu)
  }
  if (app?.renderer && resizeHandler) {
    app.renderer.off('resize', resizeHandler)
  }
  model?.destroy()
  app?.destroy(true, { children: true })
  model = null
  app = null
})
</script>

<template>
  <div class="live2d-view">
    <div ref="containerRef" class="live2d-canvas" />

    <div v-if="isLoading" class="overlay">正在唤醒猫娘...</div>

    <p v-if="loadError" class="error">{{ loadError }}</p>

    <p v-else-if="!isLoading" class="hint">左键点击模型 · 右键打开菜单 · 打开开发者工具看控制台「喵」</p>
  </div>
</template>

<style scoped>
.live2d-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
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
  font-size: 16px;
  pointer-events: none;
}

.error {
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: 24px;
  margin: 0;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(254, 226, 226, 0.92);
  color: #b91c1c;
  font-size: 14px;
  line-height: 1.6;
}

.hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 16px;
  margin: 0;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  pointer-events: none;
}
</style>
