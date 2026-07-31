/**
 * 独立小调用：鉴定三维好感调分（只输出枚举，不写数字 Δ）。
 */
import { completeMemoryChat, extractJsonObject } from '../memory/summarizeLlm'
import { logWarn } from '../logging/logger'
import { parseRelationshipProposal, type RelationshipProposal } from './proposal'
import type { RelScores } from './types'

export type RelChatRound = {
  userText: string
  assistantText: string
}

const SYSTEM_PROMPT = `你是桌宠「三维好感鉴定」助手。根据最近几轮对话，判断角色对用户的亲近/信任/投契是否应微调。只输出 JSON，不要 Markdown，不要其它说明。

字段约定（必须严格遵守枚举，禁止自造标签或数字幅度）：
- dimension：只能是 closeness | trust | rapport
- sign：1=加分，-1=扣分（禁止 0 或其它值）
- magnitude：只能是 micro | medium | high | extreme
  （微小 0.01 / 中等 0.05 / 高 0.1 / 极高 0.5；实际加减由程序计算，你不要写数字）
- reason：可选短因（≤40字）

规则：
- 可多维同时提议；同一维度也可多条（将叠加）。
- 无明显关系温度变化时返回 {"changes":[]}
- 不要输出厌恶/友好等阶段中文 TAG；那些由分数自动映射。

格式：
{"changes":[{"dimension":"closeness","sign":1,"magnitude":"medium","reason":"可选"}]}`

function formatScores(scores: RelScores): string {
  return `closeness=${scores.closeness} trust=${scores.trust} rapport=${scores.rapport}`
}

function formatRounds(rounds: RelChatRound[]): string {
  return rounds
    .map((r, i) => {
      const u = r.userText.trim().slice(0, 1500) || '（空）'
      const a = r.assistantText.trim().slice(0, 3000) || '（空）'
      return `--- 轮 ${i + 1} ---\n用户：${u}\n助手：${a}`
    })
    .join('\n')
}

export async function requestRelationshipProposalLlm(input: {
  rounds: RelChatRound[]
  scores: RelScores
}): Promise<RelationshipProposal | null> {
  const rounds = input.rounds.filter((r) => r.assistantText.trim())
  if (rounds.length === 0) return null

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: [
        '【当前好感分 -10～10】',
        formatScores(input.scores),
        '',
        '【待鉴定对话（至多 3 轮）】',
        formatRounds(rounds),
        '',
        '请输出 JSON。'
      ].join('\n')
    }
  ]

  try {
    const content = await completeMemoryChat(messages)
    const parsed = extractJsonObject(content)
    return parseRelationshipProposal(parsed)
  } catch (error) {
    logWarn('relationship', 'requestRelationshipProposalLlm failed', error)
    return null
  }
}
