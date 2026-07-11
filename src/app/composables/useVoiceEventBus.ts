import { fetchVoiceForgeStatus, type VoiceForgeStatus } from '../../services/voiceForgeApi'

export interface VoiceEventBusTarget {
  enterGeneratingBoot: () => void
  enterReview: (status: VoiceForgeStatus) => void
}

export function useVoiceEventBus(target: VoiceEventBusTarget) {
  function onVoiceForgeBoot(): void {
    target.enterGeneratingBoot()
  }

  function onVoiceUploadReview(): void {
    void (async () => {
      const status = await fetchVoiceForgeStatus()
      if (!status?.review_pending) {
        return
      }
      target.enterReview(status)
    })()
  }

  return { onVoiceForgeBoot, onVoiceUploadReview }
}
