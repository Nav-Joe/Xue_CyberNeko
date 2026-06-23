import { Point } from 'pixi.js'
import type { Live2DModel } from 'pixi-live2d-display/cubism4'
import type { BodyPart } from '../types/corpus'
import { OPAQUE_ALPHA_THRESHOLD, type OpaqueHitData } from './live2dOpaqueBounds'

const FALLBACK_LEGS_MIN_NY = 0.44

/** 仅脸/发顶；脖子与垂发归入 body */
const HEAD_MAX_NY = 0.17

/** 低于此高度不判手臂（肩线、头发下端等算 body） */
const ARMS_MIN_NY = 0.3
const ARMS_MAX_NY_CAP = 0.52

/** 绝对外缘（仅 ARMS_MIN_NY 以下生效） */
const ARMS_FAR_NX = 0.17

/** 「行变宽」判定仅用于前臂/手高度，避免披发外扩误判 */
const ARMS_ROW_WIDE_MIN_NY = 0.34
const ARM_ROW_REL_OUTER = 0.24
const ARM_ROW_WIDTH_RATIO = 1.08

function getRowSpan(
  hitData: OpaqueHitData,
  localY: number
): { min: number; max: number; width: number } | null {
  const w = hitData.bounds.width
  const h = hitData.bounds.height
  const row = Math.min(h - 1, Math.max(0, Math.floor(localY)))
  let rowMin = w
  let rowMax = -1
  const mask = hitData.alphaMask
  const rowBase = row * w

  for (let x = 0; x < w; x++) {
    if (mask[rowBase + x] >= OPAQUE_ALPHA_THRESHOLD) {
      rowMin = Math.min(rowMin, x)
      rowMax = Math.max(rowMax, x)
    }
  }

  if (rowMax < rowMin) {
    return null
  }

  return { min: rowMin, max: rowMax, width: rowMax - rowMin + 1 }
}

function armsVerticalMax(legsMinNy: number): number {
  return Math.min(ARMS_MAX_NY_CAP, legsMinNy - 0.02)
}

function isArmZone(
  nx: number,
  ny: number,
  localX: number,
  localY: number,
  legsMinNy: number,
  hitData?: OpaqueHitData | null
): boolean {
  const armsMax = armsVerticalMax(legsMinNy)
  if (ny < ARMS_MIN_NY || ny >= armsMax) {
    return false
  }

  // 最外缘：上臂 / 手（肩下披发区域已在 ARMS_MIN_NY 以上排除）
  if (nx < ARMS_FAR_NX || nx > 1 - ARMS_FAR_NX) {
    return true
  }

  if (!hitData || ny < ARMS_ROW_WIDE_MIN_NY) {
    return false
  }

  const span = getRowSpan(hitData, localY)
  if (!span || span.width < hitData.bounds.width * 0.06) {
    return false
  }

  // 该行若比典型躯干更宽，说明手臂外伸，再判左右缘
  if (span.width <= hitData.torsoRowWidth * ARM_ROW_WIDTH_RATIO) {
    return false
  }

  const relX = (localX - span.min) / span.width
  return relX < ARM_ROW_REL_OUTER || relX > 1 - ARM_ROW_REL_OUTER
}

/**
 * 用不透明像素包围盒划分虚拟部位（供语料库使用）。
 */
export function resolveBodyPart(
  model: Live2DModel,
  pointX: number,
  pointY: number,
  _hitAreas: string[],
  hitData?: OpaqueHitData | null
): BodyPart {
  let bounds: { x: number; y: number; width: number; height: number }
  let legsMinNy = FALLBACK_LEGS_MIN_NY

  if (hitData) {
    bounds = hitData.bounds
    legsMinNy = hitData.legsMinNy
  } else {
    const fallback = model.getBounds()
    if (fallback.width <= 0 || fallback.height <= 0) {
      return 'body'
    }
    bounds = fallback
  }

  const scratch = new Point(pointX, pointY)
  model.toModelPosition(scratch, scratch)

  const localX = scratch.x - bounds.x
  const localY = scratch.y - bounds.y

  if (localX < 0 || localY < 0 || localX > bounds.width || localY > bounds.height) {
    return 'body'
  }

  const nx = localX / bounds.width
  const ny = localY / bounds.height

  if (ny < HEAD_MAX_NY) {
    return 'head'
  }

  if (ny >= legsMinNy) {
    return 'legs'
  }

  if (isArmZone(nx, ny, localX, localY, legsMinNy, hitData)) {
    return 'arms'
  }

  return 'body'
}
