let voiceUploadFlowGuardActive = false

export function setVoiceUploadFlowGuard(active: boolean): void {
  voiceUploadFlowGuardActive = active
}

export function isVoiceUploadFlowGuardActive(): boolean {
  return voiceUploadFlowGuardActive
}
