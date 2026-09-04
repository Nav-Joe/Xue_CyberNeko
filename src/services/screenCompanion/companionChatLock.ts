/**
 * 屏幕偷窥「在玩会话」聊天锁纯判定（与 useScreenCompanionChatGate / CONTRACT 总闸×会话表对齐）。
 * 抽成纯函数便于单测锁语义，避免依赖 Vue 生命周期。
 */
export function isCompanionChatSendBlocked(sessionActive: boolean): boolean {
  return sessionActive === true
}
