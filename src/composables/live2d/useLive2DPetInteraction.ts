import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { Application } from 'pixi.js'
import type { Live2DModel } from 'pixi-live2d-display/cubism4'

import { opaqueLocalRect, type OpaqueHitData } from '../../services/live2dOpaqueBounds'

/** 移动超过该像素才视为拖拽，避免与点击「喵」冲突 */
export const DRAG_THRESHOLD = 8

/** 聊天快捷按钮相对模型不透明区右上角的偏移（px，屏幕坐标） */
const CHAT_SHORTCUT_OFFSET_X = 16
const CHAT_SHORTCUT_OFFSET_Y = -8

export type Live2DPetInteractionDeps = {
  isPetMode: () => boolean
  getInteractionLocked: () => boolean
  getCanvasEl: () => HTMLCanvasElement | null
  getApp: () => Application | null
  getModel: () => Live2DModel | null
  getOpaqueHitData: () => OpaqueHitData | null
  emitChatShortcutClick: () => void
  /** Home 打开时清除 View 侧 pointerActive 等，与原先锁拖行为一致 */
  onHomeVisibilityLocked?: () => void
}

/**
 * 桌宠交互：拖拽、鼠标穿透、聊天快捷入口定位、Home 显隐锁拖。
 * canvas 事件绑定与引擎/布局仍由 Live2DView 负责。
 */
export function useLive2DPetInteraction(deps: Live2DPetInteractionDeps): {
  isDragging: Ref<boolean>
  homeVisible: Ref<boolean>
  chatShortcutAnchor: Ref<{ x: number; y: number } | null>
  canDragPet: () => boolean
  isDragStarted: () => boolean
  setMouseIgnore: (ignore: boolean) => void
  syncPetMouseIgnoreForShortcut: () => void
  updatePetChatShortcutAnchor: () => void
  updateCanvasCursor: (onModel: boolean) => void
  beginPotentialDrag: (event: PointerEvent) => void
  handlePetPointerMove: (event: PointerEvent, onModel: boolean, pointerActive: boolean) => boolean
  endPetPointer: (onModel: boolean) => boolean
  onChatShortcutPointerEnter: () => void
  onChatShortcutPointerLeave: () => void
  onChatShortcutClick: () => void
} {
  const isDragging = ref(false)
  const homeVisible = ref(false)
  const chatShortcutAnchor = ref<{ x: number; y: number } | null>(null)

  let lastMouseIgnore: boolean | null = null
  let dragStarted = false
  let dragStartScreen = { x: 0, y: 0 }
  /** 按下时指针在窗口内的偏移，用于 screenX/Y 反算窗口左上角 */
  let dragPointerOffset = { x: 0, y: 0 }
  let activePointerId: number | null = null
  let chatShortcutHover = false
  let unbindHomeListener: (() => void) | null = null

  const canDragPet = () => deps.isPetMode() && !homeVisible.value

  const isDragStarted = () => dragStarted

  function setMouseIgnore(ignore: boolean): void {
    if (!deps.isPetMode() || !window.electronAPI?.setIgnoreMouseEvents) return
    if (deps.getInteractionLocked()) {
      ignore = false
    }
    if (lastMouseIgnore === ignore) return
    lastMouseIgnore = ignore
    window.electronAPI.setIgnoreMouseEvents(ignore)
  }

  function syncPetMouseIgnoreForShortcut(): void {
    if (!deps.isPetMode()) return
    if (deps.getInteractionLocked() || chatShortcutHover) {
      setMouseIgnore(false)
      return
    }
    setMouseIgnore(true)
  }

  /** 菜单关闭后重置穿透缓存，避免 lastMouseIgnore 与 Electron 实际状态不一致 */
  watch(
    () => deps.getInteractionLocked(),
    (locked, wasLocked) => {
      if (!deps.isPetMode() || locked || wasLocked === undefined) return
      lastMouseIgnore = null
      syncPetMouseIgnoreForShortcut()
    }
  )

  function updateCanvasCursor(onModel: boolean): void {
    const canvasEl = deps.getCanvasEl()
    if (!canvasEl || !deps.isPetMode()) return
    if (isDragging.value) {
      canvasEl.style.cursor = 'grabbing'
    } else if (onModel && canDragPet()) {
      canvasEl.style.cursor = 'grab'
    } else {
      canvasEl.style.cursor = 'default'
    }
  }

  function updatePetChatShortcutAnchor(): void {
    const app = deps.getApp()
    const model = deps.getModel()
    const opaqueHitData = deps.getOpaqueHitData()
    if (!deps.isPetMode() || !app || !model || !opaqueHitData) {
      chatShortcutAnchor.value = null
      return
    }
    const local = opaqueLocalRect(opaqueHitData, 0.5, 0.5)
    const scale = model.scale.x
    chatShortcutAnchor.value = {
      x: model.position.x + local.right * scale + CHAT_SHORTCUT_OFFSET_X,
      y: model.position.y + local.top * scale + CHAT_SHORTCUT_OFFSET_Y
    }
  }

  function movePetWindowToScreenPoint(screenX: number, screenY: number): void {
    window.electronAPI.setPetWindowPosition(
      Math.round(screenX - dragPointerOffset.x),
      Math.round(screenY - dragPointerOffset.y)
    )
  }

  function releasePointerCapture(): void {
    const canvasEl = deps.getCanvasEl()
    if (activePointerId === null || !canvasEl) return

    try {
      canvasEl.releasePointerCapture(activePointerId)
    } catch {
      // 指针已释放时忽略
    }
    activePointerId = null
  }

  function beginPotentialDrag(event: PointerEvent): void {
    dragStarted = false
    dragStartScreen = { x: event.screenX, y: event.screenY }
    dragPointerOffset = { x: event.clientX, y: event.clientY }
    activePointerId = event.pointerId

    if (canDragPet()) {
      deps.getCanvasEl()?.setPointerCapture(event.pointerId)
      setMouseIgnore(false)
    }
  }

  /**
   * 处理桌宠 pointermove 中的穿透与拖拽。
   * @returns true 表示拖拽中已处理完，调用方应提前 return
   */
  function handlePetPointerMove(
    event: PointerEvent,
    onModel: boolean,
    pointerActive: boolean
  ): boolean {
    if (!deps.isPetMode()) return false
    if (deps.getInteractionLocked()) {
      return false
    }

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
        return true
      }
    }

    if (!pointerActive) {
      setMouseIgnore(!onModel)
    }
    updateCanvasCursor(onModel)
    return false
  }

  /**
   * 结束桌宠指针交互：释放 capture、复位拖拽态、按需恢复穿透。
   * @returns 本次是否曾进入拖拽（调用方据此决定是否触发 tap）
   */
  function endPetPointer(onModel: boolean): boolean {
    const didDrag = dragStarted
    releasePointerCapture()

    dragStarted = false
    isDragging.value = false
    updateCanvasCursor(onModel)

    if (deps.isPetMode() && !onModel) {
      setMouseIgnore(true)
    }

    return didDrag
  }

  function onChatShortcutPointerEnter(): void {
    chatShortcutHover = true
    syncPetMouseIgnoreForShortcut()
  }

  function onChatShortcutPointerLeave(): void {
    chatShortcutHover = false
    syncPetMouseIgnoreForShortcut()
  }

  function onChatShortcutClick(): void {
    deps.emitChatShortcutClick()
  }

  onMounted(() => {
    if (deps.isPetMode() && window.electronAPI?.onHomeVisibilityChanged) {
      unbindHomeListener = window.electronAPI.onHomeVisibilityChanged((visible) => {
        homeVisible.value = visible
        if (visible) {
          dragStarted = false
          isDragging.value = false
          deps.onHomeVisibilityLocked?.()
        }
      })
    }
  })

  onBeforeUnmount(() => {
    unbindHomeListener?.()
    unbindHomeListener = null
  })

  return {
    isDragging,
    homeVisible,
    chatShortcutAnchor,
    canDragPet,
    isDragStarted,
    setMouseIgnore,
    syncPetMouseIgnoreForShortcut,
    updatePetChatShortcutAnchor,
    updateCanvasCursor,
    beginPotentialDrag,
    handlePetPointerMove,
    endPetPointer,
    onChatShortcutPointerEnter,
    onChatShortcutPointerLeave,
    onChatShortcutClick
  }
}
