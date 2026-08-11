/**
 * 一轮回复成功后的收尾：把助手原文写入记忆，并后台跑总结/欲望/好感。
 * 满轮总结必须后台跑，不能拖到「发送中」状态一直不结束。
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
  maybeMidSessionConsolidateInBackground(input.sessionId)
  // 轮后后台欲望鉴定（空库门控在主进程）
  if (input.desireEnabled) {
    maybeDesireAfterTurnInBackground({
      userText: input.userText,
      assistantText
    })
  }
  // 好感每 3 轮鉴定；随情感插件总闸
  if (input.desireEnabled) {
    noteRelationshipRoundMaybeEval({
      userText: input.userText,
      assistantText
    })
  }
}
