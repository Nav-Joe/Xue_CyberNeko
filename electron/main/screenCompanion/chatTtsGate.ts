/**
 * 屏幕偷窥总开关依赖聊天 TTS：对话 TTS 未开时，不允许打开屏幕偷窥。
 */
import { readChatConfigFile, toChatConfigView } from '../chat/chat-config'

export function isChatTtsEnabledForCompanion(): boolean {
  return toChatConfigView(readChatConfigFile()).ttsEnabled !== false
}
