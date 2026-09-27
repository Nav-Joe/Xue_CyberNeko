<script setup lang="ts">
import PetBootOverlay from '../../components/PetBootOverlay.vue'
import VoiceEngineLoadingOverlay from '../../components/VoiceEngineLoadingOverlay.vue'
import VoiceForgeReviewDialog from '../../components/VoiceForgeReviewDialog.vue'
import type { BootStep } from '../../constants/petBoot'
import type { VoiceForgeStatus } from '../../services/voiceForgeApi'
import type { BootPhase } from '../types'

defineProps<{
  showEngineLoadOverlay: boolean
  engineLoadTitle: string
  engineLoadMessage: string
  engineLoadProgress: { done: number; total: number } | null
  showBootOverlay: boolean
  bootSteps: BootStep[]
  bootCurrentStepId: string
  bootMessage: string
  bootProgress: { done: number; total: number } | null
  bootPhase: BootPhase
  reviewStatus: VoiceForgeStatus | null
  /** 云端 approve 失败后恢复审阅时展示 */
  reviewError?: string | null
  /** 云端 design/重新生成失败时展示在 Boot 遮罩 */
  bootError?: string | null
}>()

defineEmits<{
  approved: []
  done: []
  regenerating: [detail: import('../composables/useVoiceEventBus').CloudVoiceForgeStartDetail | null]
  dismissBootError: []
}>()
</script>

<template>
  <VoiceEngineLoadingOverlay
    v-if="showEngineLoadOverlay"
    :title="engineLoadTitle"
    :message="engineLoadMessage"
    :progress="engineLoadProgress"
  />

  <PetBootOverlay
    v-else-if="showBootOverlay"
    :steps="bootSteps"
    :current-step-id="bootCurrentStepId"
    :message="bootMessage"
    :progress="bootProgress"
    :error="bootError"
    @dismiss="$emit('dismissBootError')"
  />

  <VoiceForgeReviewDialog
    v-if="bootPhase === 'review' && reviewStatus"
    :status="reviewStatus"
    :initial-error="reviewError || ''"
    @approved="$emit('approved')"
    @done="$emit('done')"
    @regenerating="$emit('regenerating', $event)"
  />
</template>
