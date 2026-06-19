import type { Live2DModel } from 'pixi-live2d-display/cubism4'
import type { BodyPart } from '../types/corpus'

/**
 * hiyori 等模型在 model3.json 里往往只有一个 HitArea（Body）。
 * 真实的多部位 HitArea 需要在 Live2D Cubism Editor 里绘制，无法仅靠改 JSON 生效。
 * 这里用点击点在模型包围盒内的相对坐标，划分虚拟部位供语料库使用。
 */
export function resolveBodyPart(
  model: Live2DModel,
  pointX: number,
  pointY: number,
  _hitAreas: string[]
): BodyPart {
  const bounds = model.getBounds()

  if (bounds.width <= 0 || bounds.height <= 0) {
    return 'body'
  }

  const nx = (pointX - bounds.x) / bounds.width
  const ny = (pointY - bounds.y) / bounds.height

  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
    return 'body'
  }

  if (ny < 0.26) {
    return 'head'
  }

  if (ny > 0.78) {
    return 'legs'
  }

  if (ny >= 0.28 && ny <= 0.58 && (nx < 0.22 || nx > 0.78)) {
    return 'arms'
  }

  // 该模型无尾巴 HitArea，tail 预留给以后有尾巴的模型
  return 'body'
}
