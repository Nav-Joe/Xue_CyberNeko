/** 渲染侧会话缓冲：满 N 轮或关窗立刻送检（不按 raw_logs 计数） */

export const REL_EVAL_EVERY_N = 3

export type RelChatRound = {
  userText: string
  assistantText: string
}

export type RelationshipTurnBuffer = {
  push: (round: RelChatRound) => RelChatRound[] | null
  flush: () => RelChatRound[] | null
  size: () => number
  clear: () => void
}

export function createRelationshipTurnBuffer(
  everyN: number = REL_EVAL_EVERY_N
): RelationshipTurnBuffer {
  const n = Math.max(1, Math.floor(everyN))
  let rounds: RelChatRound[] = []

  return {
    push(round) {
      const userText = round.userText.trim()
      const assistantText = round.assistantText.trim()
      if (!assistantText) return null
      rounds.push({ userText, assistantText })
      if (rounds.length < n) return null
      const batch = rounds.slice(0, n)
      rounds = rounds.slice(n)
      return batch
    },
    flush() {
      if (rounds.length === 0) return null
      const batch = rounds
      rounds = []
      return batch
    },
    size: () => rounds.length,
    clear: () => {
      rounds = []
    }
  }
}
