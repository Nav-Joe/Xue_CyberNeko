/**
 * 独立小调用：鉴定角色自身欲望（禁止把用户愿望写成欲望条目）。
 */
import { completeMemoryChat, extractJsonObject } from '../memory/summarizeLlm'
import { logWarn } from '../logging/logger'
import type { DesireSnapshot } from './types'
import { parseDesireProposal, type DesireProposal } from './proposal'

const SYSTEM_PROMPT = `你是桌宠角色的「欲望鉴定」助手。根据对话判断**角色（助手）自己的欲望**，只输出 JSON，不要 Markdown，不要其它说明。
铁律：
- desire 只能是角色第一人称想要的东西（如想吃草莓、想被陪伴），禁止把用户的愿望/待办写成欲望。
- intensity 0～10；patienceMax 1～200（调整时宜小幅，不要无故拉满或清零）。
- outcome：ignored=用户未理睬/拖延该欲；advanced=用户明显推进；neutral=沾边或闲聊。
- 单次最多 create 1 条新欲望；已有欲望用 keep/fulfill/abandon/replace。
格式：
{"desires":[{"id":"已有uuid或null","action":"keep|replace|create|fulfill|abandon","name":"短名","description":"可选","intensity":8,"patienceMax":100,"outcome":"ignored|neutral|advanced"}]}
无事可做时返回 {"desires":[]}`

function formatOpenSnapshot(open: DesireSnapshot[]): string {
  if (open.length === 0) return '（当前无活跃欲望）'
  return open
    .map(
      (d) =>
        `- id=${d.id} name=${d.name} intensity=${d.intensity} P=${d.patienceRemaining}/${d.patienceMax} state=${d.state} protection=${d.protectionTurnsRemaining}`
    )
    .join('\n')
}

export async function requestDesireProposalLlm(input: {
  userText: string
  assistantText: string
  open: DesireSnapshot[]
}): Promise<DesireProposal | null> {
  const userText = input.userText.trim().slice(0, 2000)
  const assistantText = input.assistantText.trim().slice(0, 4000)
  if (!assistantText) return null

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: [
        '【当前活跃欲望】',
        formatOpenSnapshot(input.open),
        '',
        '【本轮用户】',
        userText || '（空）',
        '',
        '【本轮助手回复】',
        assistantText,
        '',
        '请输出 JSON。'
      ].join('\n')
    }
  ]

  try {
    const content = await completeMemoryChat(messages)
    const parsed = extractJsonObject(content)
    return parseDesireProposal(parsed)
  } catch (error) {
    logWarn('desire', 'requestDesireProposalLlm failed', error)
    return null
  }
}
