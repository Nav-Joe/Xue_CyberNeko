/**
 * 欲望 → Prompt 纯文本（情感模拟指令；非真实需求）。
 */
import { resolvePatienceStage } from './engine'
import type { DesirePatienceStage, DesireSnapshot } from './types'

function stageHint(stage: DesirePatienceStage, protectedTurn: boolean): string {
  if (protectedTurn) {
    return '重逢缓冲期内：可委婉表达想念或好奇对方是否忙碌，不要一上来撒泼打滚。'
  }
  if (stage === 'calm') {
    return '可自然提及该欲望，勿反复纠缠。'
  }
  if (stage === 'restless') {
    return '可提醒、可轻微抱怨对方拖延，仍保持角色一致。'
  }
  return '允许反复提及、催促，甚至撒泼打滚表达不满——这是角色扮演模拟，不是系统故障。'
}

export function renderDesirePromptBlock(desires: DesireSnapshot[]): string {
  if (desires.length === 0) return ''
  const lines: string[] = ['【当前欲望（情感模拟·非真实生理需求）】']
  for (const d of desires) {
    const stage = resolvePatienceStage(d)
    const max = Math.max(0, d.patienceMax)
    const rem = Math.max(0, d.patienceRemaining)
    const protectedTurn = d.protectionTurnsRemaining > 0
    const stageLabel = protectedTurn ? `${stage}（保护期·按 active 演出）` : stage
    lines.push(
      `- 欲望：${d.name}｜强度 ${formatNum(d.intensity)}/10｜忍耐 ${formatNum(rem)}/${formatNum(max)}｜阶段 ${stageLabel}`
    )
    if (d.description.trim()) {
      lines.push(`  说明：${d.description.trim()}`)
    }
    lines.push(`  行为提示：${stageHint(stage, protectedTurn)}`)
  }
  return lines.join('\n')
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return (Math.round(n * 10) / 10).toString()
}
