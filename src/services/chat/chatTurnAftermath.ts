/**
 * 一轮回复成功后的收尾：把助手原文写入记忆，并后台跑总结/欲望/好感。
 *
 * 分档（③）：满轮总结 / 欲望 / 好感必须后台（禁止 await）；
 * 助手 raw 可 await（写完再放后台），但不得把「发送中」拖到总结 LLM 结束。
 */
import { appendMemoryRawLog, maybeMidSessionConsolidateInBackground } from '../memory/memoryClient'
import { maybeDesireAfterTurnInBackground } from '../desire/desireClient'
import { noteRelationshipRoundMaybeEval } from '../relationship/relationshipClient'

export async function runChatTurnAftermath(input: {
  sessionId: string
  memoryEnabled: boolean
  desireEnabled: boolean
  userText: string
  assistantText: string
}): Promise<void> {
  const assistantText = input.assistantText.trim()
  if (!input.memoryEnabled || !assistantText) return

  // 助手原文先写入记忆；满轮总结后台跑，别拖住「发送中」状态
  await appendMemoryRawLog({
    sessionId: input.sessionId,
    role: 'assistant',
    content: assistantText
  })
  // ③ 禁止 await：满轮总结 / 欲望 / 好感（三者可并行抢 LLM，但都不得拖 sending）
  maybeMidSessionConsolidateInBackground(input.sessionId)
  // 轮后后台欲望鉴定（空库门控在主进程；不进 consolidateChain）
  if (input.desireEnabled) {
    maybeDesireAfterTurnInBackground({
      userText: input.userText,
      assistantText
    })
  }
  // 好感每 3 轮鉴定；随情感插件总闸（亦不进 consolidateChain）
  if (input.desireEnabled) {
    noteRelationshipRoundMaybeEval({
      userText: input.userText,
      assistantText
    })
  }
}
