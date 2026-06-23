import type { Application, Point, Rectangle } from 'pixi.js'
import type { Live2DModel } from 'pixi-live2d-display/cubism4'

/** 视为不透明的 alpha 阈值（0–255） */
export const OPAQUE_ALPHA_THRESHOLD = 12

/** 离线采样最大边长，避免 2048 画布全量扫描过慢 */
const MAX_RENDER_DIM = 1024

const hitScratch = { x: 0, y: 0 } as Point

export interface OpaqueBounds {
  /** Cubism 画布坐标系（左上角为原点） */
  x: number
  y: number
  width: number
  height: number
}

export interface OpaqueLocalRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

export interface OpaqueHitData {
  bounds: OpaqueBounds
  /** 裁剪到 bounds 内的 alpha 通道，行优先 */
  alphaMask: Uint8Array
  canvasWidth: number
  canvasHeight: number
  /** 不透明轮廓内：此比例以下视为腿部（按蒙版估算裙摆下缘） */
  legsMinNy: number
  /** 上躯干典型行宽（用于区分「手臂外伸变宽」与「纯躯干」） */
  torsoRowWidth: number
}

/** 根据不透明行宽估算裙摆下缘 → 腿区起点（相对 bounds 高度 0–1） */
export function estimateLegsMinNy(hitData: Pick<OpaqueHitData, 'bounds' | 'alphaMask'>): number {
  const { bounds, alphaMask } = hitData
  const w = bounds.width
  const h = bounds.height
  if (w <= 0 || h <= 0) {
    return 0.44
  }

  let maxRowWidth = 0
  const rowWidths = new Array<number>(h)
  for (let ly = 0; ly < h; ly++) {
    let minX = w
    let maxX = -1
    for (let lx = 0; lx < w; lx++) {
      if (alphaMask[ly * w + lx] >= OPAQUE_ALPHA_THRESHOLD) {
        minX = Math.min(minX, lx)
        maxX = Math.max(maxX, lx)
      }
    }
    const width = maxX >= minX ? maxX - minX + 1 : 0
    rowWidths[ly] = width
    if (width > maxRowWidth) {
      maxRowWidth = width
    }
  }

  if (maxRowWidth <= 0) {
    return 0.44
  }

  const wideThreshold = maxRowWidth * 0.52
  let hemRow = Math.floor(h * 0.38)
  const scanEnd = Math.floor(h * 0.72)
  for (let ly = Math.floor(h * 0.18); ly < scanEnd; ly++) {
    if (rowWidths[ly] >= wideThreshold) {
      hemRow = ly
    }
  }

  const ny = (hemRow + Math.max(1, Math.round(h * 0.015))) / h
  return Math.min(0.56, Math.max(0.36, ny))
}

/** 上躯干（肩–胸）典型行宽中位数，作「手臂外伸」对比基准 */
export function estimateTorsoRowWidth(hitData: Pick<OpaqueHitData, 'bounds' | 'alphaMask'>): number {
  const { bounds, alphaMask } = hitData
  const w = bounds.width
  const h = bounds.height
  if (w <= 0 || h <= 0) {
    return w * 0.45
  }

  const samples: number[] = []
  const yStart = Math.floor(h * 0.26)
  const yEnd = Math.min(Math.floor(h * 0.4), h)
  for (let ly = yStart; ly < yEnd; ly++) {
    let minX = w
    let maxX = -1
    for (let lx = 0; lx < w; lx++) {
      if (alphaMask[ly * w + lx] >= OPAQUE_ALPHA_THRESHOLD) {
        minX = Math.min(minX, lx)
        maxX = Math.max(maxX, lx)
      }
    }
    if (maxX >= minX) {
      samples.push(maxX - minX + 1)
    }
  }

  if (samples.length === 0) {
    return w * 0.45
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

export function opaqueLocalRect(
  hitData: OpaqueHitData,
  anchorX = 0.5,
  anchorY = 0.5
): OpaqueLocalRect {
  const { bounds, canvasWidth, canvasHeight } = hitData
  const pivotX = canvasWidth * anchorX
  const pivotY = canvasHeight * anchorY
  const left = bounds.x - pivotX
  const top = bounds.y - pivotY
  const right = bounds.x + bounds.width - pivotX
  const bottom = bounds.y + bounds.height - pivotY

  return {
    left,
    top,
    right,
    bottom,
    width: bounds.width,
    height: bounds.height,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  }
}

export function applyOpaqueHitArea(
  model: Live2DModel,
  hitData: OpaqueHitData,
  RectangleClass: typeof Rectangle
): void {
  const local = opaqueLocalRect(hitData, model.anchor.x, model.anchor.y)
  model.hitArea = new RectangleClass(local.left, local.top, local.width, local.height)
}

export function hitTestOpaquePoint(
  model: Live2DModel,
  worldX: number,
  worldY: number,
  hitData: OpaqueHitData,
  _scratch?: Point
): boolean {
  hitScratch.x = worldX
  hitScratch.y = worldY
  model.toModelPosition(hitScratch, hitScratch)

  const { bounds, alphaMask } = hitData
  const ix = Math.floor(hitScratch.x)
  const iy = Math.floor(hitScratch.y)

  if (
    ix < bounds.x ||
    iy < bounds.y ||
    ix >= bounds.x + bounds.width ||
    iy >= bounds.y + bounds.height
  ) {
    return false
  }

  const lx = ix - bounds.x
  const ly = iy - bounds.y
  return alphaMask[ly * bounds.width + lx] >= OPAQUE_ALPHA_THRESHOLD
}

/**
 * 将模型渲染到离屏纹理，扫描 alpha 通道得到不透明像素最小包围盒。
 */
export async function extractOpaqueHitData(
  app: Application,
  model: Live2DModel,
  updateFrame: () => void
): Promise<OpaqueHitData | null> {
  const PIXI = await import('pixi.js')

  const canvasWidth = model.internalModel.width
  const canvasHeight = model.internalModel.height
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return null
  }

  const prev = {
    anchorX: model.anchor.x,
    anchorY: model.anchor.y,
    scaleX: model.scale.x,
    scaleY: model.scale.y,
    x: model.position.x,
    y: model.position.y
  }

  const maxDim = Math.max(canvasWidth, canvasHeight)
  const renderScale = maxDim > MAX_RENDER_DIM ? MAX_RENDER_DIM / maxDim : 1
  const rtW = Math.max(1, Math.round(canvasWidth * renderScale))
  const rtH = Math.max(1, Math.round(canvasHeight * renderScale))

  model.anchor.set(0, 0)
  model.scale.set(renderScale)
  model.position.set(0, 0)
  updateFrame()

  const renderTexture = PIXI.RenderTexture.create({ width: rtW, height: rtH })
  app.renderer.render(model, { renderTexture, clear: true })

  const pixels = app.renderer.plugins.extract.pixels(renderTexture) as Uint8Array
  renderTexture.destroy(true)

  model.anchor.set(prev.anchorX, prev.anchorY)
  model.scale.set(prev.scaleX, prev.scaleY)
  model.position.set(prev.x, prev.y)

  let minX = rtW
  let minY = rtH
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < rtH; y++) {
    for (let x = 0; x < rtW; x++) {
      const alpha = pixels[(y * rtW + x) * 4 + 3]
      if (alpha >= OPAQUE_ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null
  }

  const inv = 1 / renderScale
  const bounds: OpaqueBounds = {
    x: Math.floor(minX * inv),
    y: Math.floor(minY * inv),
    width: Math.ceil((maxX - minX + 1) * inv),
    height: Math.ceil((maxY - minY + 1) * inv)
  }

  const alphaMask = new Uint8Array(bounds.width * bounds.height)
  for (let ly = 0; ly < bounds.height; ly++) {
    for (let lx = 0; lx < bounds.width; lx++) {
      const cx = bounds.x + lx
      const cy = bounds.y + ly
      const rx = Math.min(rtW - 1, Math.round(cx * renderScale))
      const ry = Math.min(rtH - 1, Math.round(cy * renderScale))
      alphaMask[ly * bounds.width + lx] = pixels[(ry * rtW + rx) * 4 + 3]
    }
  }

  return {
    bounds,
    alphaMask,
    canvasWidth,
    canvasHeight,
    legsMinNy: estimateLegsMinNy({ bounds, alphaMask }),
    torsoRowWidth: estimateTorsoRowWidth({ bounds, alphaMask })
  }
}
