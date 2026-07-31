/**
 * 今日摸摸 → Prompt 纯文本（并入聊天 system，不另开 LLM）。
 */
import {
  PET_TOUCH_PART_LABELS,
  PET_TOUCH_PARTS,
  type PetTouchDaySnapshot
} from './types'

export function renderPetTouchPromptBlock(snap: PetTouchDaySnapshot): string {
  const lines = [
    '【今日摸摸状况】',
    `- 合计：${snap.total} 次`,
    ...PET_TOUCH_PARTS.map(
      (p) => `- ${PET_TOUCH_PART_LABELS[p]}：${snap.counts[p] ?? 0} 次`
    )
  ]
  return lines.join('\n')
}
