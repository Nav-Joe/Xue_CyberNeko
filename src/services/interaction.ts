import type { Live2DModel } from 'pixi-live2d-display/cubism4'
import { resolveBodyPart } from './bodyPart'
import { pickCorpusLine } from './corpus'
import { isCustomCorpusTouchEnabled } from './touchModeSettings'
import { playRandomTouchClip } from './touchClipPlayer'
import { isRealtimeInferenceEnabled } from './ttsSettings'
import { isRealtimeTouchBusy, speakText } from './ttsPlayer'
import type { BodyPart } from '../types/corpus'

import type { OpaqueHitData } from './live2dOpaqueBounds'

export interface ModelTapPayload {
  model: Live2DModel
  pointX: number
  pointY: number
  hitAreas: string[]
  isHome: boolean
  opaqueHitData?: OpaqueHitData | null
}

export async function handleModelTap(payload: ModelTapPayload): Promise<void> {
  const virtualPart = resolveBodyPart(
    payload.model,
    payload.pointX,
    payload.pointY,
    payload.hitAreas,
    payload.opaqueHitData
  )

  const hitLabel = payload.hitAreas.join(', ') || 'unknown'

  if (!isCustomCorpusTouchEnabled()) {
    console.log(`[Live2D] 点击 HitArea: ${hitLabel} → 虚拟部位: ${virtualPart} → 音色工坊/精选音频`)
    const played = await playRandomTouchClip()
    if (!played) {
      console.warn('[交互] 精选音频库为空或播放失败，请配置 public/touch_clips/')
    }
    return
  }

  if (isRealtimeInferenceEnabled() && isRealtimeTouchBusy()) {
    console.info('[交互] 实时推理进行中，已忽略重复点击')
    return
  }

  const picked = pickCorpusLine(virtualPart)
  if (!picked) {
    console.warn('[交互] 语料库为空，无法回应')
    return
  }

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
