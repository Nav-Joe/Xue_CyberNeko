import { computed, type Ref } from 'vue'
import type { BootPhase, OverlaySpec } from '../types'
import type { VoiceForgeStatus } from '../../services/voiceForgeApi'

export const OVERLAY_SPECS = {
  boot: { width: 360, height: 300 },
  engineLoad: { width: 360, height: 260 },
  review: { width: 360, height: 520 },
  chatBoot: { width: 360, height: 300 }
} satisfies Record<'boot' | 'engineLoad' | 'review' | 'chatBoot', OverlaySpec>

export interface OverlayManagerInput {
  bootPhase: Ref<BootPhase>
  showBootOverlay: Ref<boolean>
  engineLoadActive: Ref<boolean>
  menuVisible: Ref<boolean>
  reviewStatus: Ref<VoiceForgeStatus | null>
  chatBooting?: Ref<boolean>
}

export function useOverlayManager(input: OverlayManagerInput) {
  const showEngineLoadOverlay = computed(() => input.engineLoadActive.value)

  const shouldShrinkToPet = computed(
    () =>
      input.bootPhase.value === 'ready' &&
      !input.menuVisible.value &&
      !input.reviewStatus.value &&
      !input.engineLoadActive.value &&
      !input.chatBooting?.value
  )

  const activeOverlay = computed((): OverlaySpec | null => {
    if (shouldShrinkToPet.value) return null
    if (input.chatBooting?.value) return OVERLAY_SPECS.chatBoot
    if (input.bootPhase.value === 'review') return OVERLAY_SPECS.review
    if (showEngineLoadOverlay.value) return OVERLAY_SPECS.engineLoad
    if (input.showBootOverlay.value) return OVERLAY_SPECS.boot
    return null
  })

  const needsMouseCapture = computed(() => !shouldShrinkToPet.value)

  return { showEngineLoadOverlay, shouldShrinkToPet, activeOverlay, needsMouseCapture }
}
