/**
 * 云端审阅桥接：绕过 ReviewDialog → BootScreen → PetApp 的 emit 链，
 * 保证「重新生成 / 满意预热」立刻切到 Boot 遮罩。
 */

type Handler = () => void

let regenerateHandler: Handler | null = null
let approveHandler: Handler | null = null

export function registerCloudRegenerateHandler(next: Handler | null): void {
  regenerateHandler = next
}

export function registerCloudApproveHandler(next: Handler | null): void {
  approveHandler = next
}

/** @returns 是否已交给 PetApp 处理 */
export function requestCloudVoiceRegenerate(): boolean {
  if (!regenerateHandler) {
    console.warn('[voiceForgeReviewBridge] regenerate requested but no handler')
    return false
  }
  regenerateHandler()
  return true
}

/** @returns 是否已交给 PetApp 处理 */
export function requestCloudVoiceApprove(): boolean {
  if (!approveHandler) {
    console.warn('[voiceForgeReviewBridge] approve requested but no handler')
    return false
  }
  approveHandler()
  return true
}
