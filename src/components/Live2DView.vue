<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

const MODEL_URL = '/models/Haru/Haru.model3.json'

const containerRef = ref<HTMLDivElement | null>(null)
const loadError = ref('')
const isLoading = ref(true)

let app: PIXI.Application | null = null
let model: Live2DModel | null = null

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
    // Haru 模型的待机动作组名为 Idle，会随机播放并自动循环
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

  Live2DModel.registerTicker(PIXI.Ticker)

  app = new PIXI.Application({
    backgroundAlpha: 0,
    resizeTo: container,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
  })

  container.appendChild(app.view as HTMLCanvasElement)
  ;(app.view as HTMLCanvasElement).addEventListener('contextmenu', handleContextMenu)

  try {
    model = await Live2DModel.from(MODEL_URL, {
      autoInteract: true,
      autoUpdate: true
    })

    app.stage.addChild(model)
    layoutModel()
    startIdleMotion()

    app.renderer.on('resize', layoutModel)

    model.on('pointertap', handlePointerTap)

    model.on('hit', (hitAreas: string[]) => {
      console.log('[Live2D] 点击部位:', hitAreas.join(', '))
    })

    isLoading.value = false
    console.log('[Live2D] 模型加载成功:', model.internalModel.settings.name)
  } catch (error) {
    isLoading.value = false
    loadError.value =
      'Live2D 模型加载失败。请先在项目根目录执行 npm run setup:model 下载官方 Haru 示例模型。'
    console.error('[Live2D] 模型加载失败:', error)
  }
}

onMounted(() => {
  void initLive2D()
})

onBeforeUnmount(() => {
  if (app?.view) {
    ;(app.view as HTMLCanvasElement).removeEventListener('contextmenu', handleContextMenu)
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
