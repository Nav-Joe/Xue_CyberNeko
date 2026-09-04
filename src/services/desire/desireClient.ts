/**
 * 渲染侧欲望 IPC：发前注入 + 轮后后台鉴定。
 * 轮后必须 F&F（scheduleMemoryBackground）；不进 consolidateChain；勿改成 await IPC。
 */
import { scheduleMemoryBackground } from '../memory/scheduleMemoryBackground'

export async function getDesirePromptBlock(nowMs?: number): Promise<string> {
  try {
    const result = await window.electronAPI?.desireGetPromptBlock?.(
      nowMs != null ? { nowMs } : undefined
    )
    if (!result || !result.ok) return ''
    return result.block?.trim() ?? ''
  } catch {
    return ''
  }
}

/** 轮后后台欲望鉴定，不阻塞 sending（禁止 await 本函数返回后再往下「等鉴定」） */
export function maybeDesireAfterTurnInBackground(payload: {
  userText: string
  assistantText: string
}): void {
  scheduleMemoryBackground('desire-after-turn', () =>
    window.electronAPI?.desireApplyAfterTurn?.(payload)
  )
}
