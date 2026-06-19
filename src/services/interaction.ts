import type { Live2DModel } from 'pixi-live2d-display/cubism4'
import { resolveBodyPart } from './bodyPart'
import { pickCorpusLine } from './corpus'
import { speakText } from './ttsPlayer'
import type { BodyPart } from '../types/corpus'

export interface ModelTapPayload {
  model: Live2DModel
  pointX: number
  pointY: number
  hitAreas: string[]
  isHome: boolean
}

export async function handleModelTap(payload: ModelTapPayload): Promise<void> {
  const virtualPart = resolveBodyPart(
    payload.model,
    payload.pointX,
    payload.pointY,
    payload.hitAreas
  )

  const picked = pickCorpusLine(virtualPart)
  if (!picked) {
    console.warn('[交互] 语料库为空，无法回应')
    return
  }

  const hitLabel = payload.hitAreas.join(', ') || 'unknown'
  const prefix = payload.isHome ? '喵~' : '喵'
  const partNote =
    picked.fallback && virtualPart !== picked.part
      ? `（${virtualPart} 暂无语料，使用 ${picked.part}）`
      : ''

  console.log(
    `[Live2D] 点击 HitArea: ${hitLabel} → 虚拟部位: ${virtualPart}${partNote}`,
    `${prefix} ${picked.line}`
  )

  try {
    await speakText(picked.line)
  } catch {
    // speakText 已记录错误
  }
}

export function describeBodyPart(part: BodyPart): string {
  const labels: Record<BodyPart, string> = {
    head: '头部',
    arms: '手臂',
    body: '身体',
    legs: '腿部',
    tail: '尾巴'
  }
  return labels[part]
}
