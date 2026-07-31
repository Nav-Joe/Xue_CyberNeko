/**
 * 无活跃欲望时，仅当助手回复命中「角色自我欲望」类关键词才触发鉴定 LLM。
 * 复用记忆侧连续串 + 滑窗；只扫助手回复。
 */
import { matchContinuousOrSlidingWindow } from '../memory/vitality'

/**
 * 第一人称欲表达。刻意不用光秃「想」「想要」，降低「我不想要」误伤。
 */
export const DESIRE_SELF_TRIGGER_PHRASES = [
  '我想',
  '好想',
  '我想要',
  '好想要',
  '我想吃',
  '好想吃',
  '我想喝',
  '想被',
  '想和你',
  '想陪你',
  '能不能给我',
  '给我买',
  '带我去'
] as const

export function assistantDesireTriggerHit(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false
  // 只用强命中（连续整串），避免滑窗把「你想吃」打成「我想吃」的弱窗
  for (const phrase of DESIRE_SELF_TRIGGER_PHRASES) {
    if (matchContinuousOrSlidingWindow(text, phrase) === 'strong') return true
  }
  return false
}

export function shouldRunDesireLlmWhenEmpty(assistantText: string): boolean {
  return assistantDesireTriggerHit(assistantText)
}
