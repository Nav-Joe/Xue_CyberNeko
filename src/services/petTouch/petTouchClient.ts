/**
 * 渲染侧摸摸计数；主进程按门控可选加亲近；与 TTS 无关。
 */
import type { BodyPart } from '../../types/corpus'

export type PetTouchDayView = {
  dayKey: string
  counts: Record<BodyPart, number>
  total: number
  affectionGrants: number
  affectionCap: number
  /** 情感插件 + 记忆开时才可能加亲近 */
  affectionEnabled: boolean
}

export const PET_TOUCH_RECORDED_EVENT = 'pet-touch-recorded'

export async function getPetTouchToday(): Promise<PetTouchDayView | null> {
  try {
    const result = await window.electronAPI?.petTouchGetToday?.()
    if (!result || !result.ok) return null
    return {
      dayKey: result.dayKey,
      counts: result.counts,
      total: result.total,
      affectionGrants: result.affectionGrants,
      affectionCap: result.affectionCap,
      affectionEnabled: result.affectionEnabled === true
    }
  } catch {
    return null
  }
}

export async function getPetTouchPromptBlock(nowMs?: number): Promise<string> {
  try {
    const result = await window.electronAPI?.petTouchGetPromptBlock?.(
      nowMs != null ? { nowMs } : undefined
    )
    if (!result || !result.ok) return ''
    return result.block?.trim() ?? ''
  } catch {
    return ''
  }
}

/** 触摸后后台记账；成功则广播事件供家窗刷新 */
export function notePetTouchInBackground(part: BodyPart): void {
  try {
    void Promise.resolve()
      .then(() => window.electronAPI?.petTouchRecord?.({ part }))
      .then((result) => {
        if (!result || !result.ok) return
        window.dispatchEvent(
          new CustomEvent(PET_TOUCH_RECORDED_EVENT, {
            detail: {
              dayKey: result.dayKey,
              counts: result.counts,
              total: result.total,
              affectionGrants: result.affectionGrants,
              affectionCap: result.affectionCap,
              affectionEnabled: result.affectionEnabled === true
            } satisfies PetTouchDayView
          })
        )
      })
      .catch((error: unknown) => {
        console.warn('[pet-touch] record failed', error)
      })
  } catch (error) {
    console.warn('[pet-touch] record sync throw', error)
  }
}
