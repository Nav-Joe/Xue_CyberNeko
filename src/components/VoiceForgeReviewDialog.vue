<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  approveVoiceForgeSample,
  fetchVoiceForgePreviewBlob,
  rejectVoiceForgeSample,
  type VoiceForgeStatus
} from '../services/voiceForgeApi'
import { setTouchFeedbackMode } from '../services/touchModeSettings'

const props = defineProps<{
  status: VoiceForgeStatus
}>()

const isUploadSource = computed(() => props.status.source === 'upload')

const emit = defineEmits<{
  approved: []
  done: []
  regenerating: []
}>()

const step = ref<'preview' | 'reject'>('preview')
const busy = ref(false)
const error = ref('')
const audioRef = ref<HTMLAudioElement | null>(null)
const previewUrl = ref('')
let previewObjectUrl: string | null = null

async function loadPreviewAudio(): Promise<void> {
  error.value = ''
  const blob = await fetchVoiceForgePreviewBlob()
  if (!blob) {
    error.value = '试听音频加载失败，请确认 TTS 服务正在运行'
    return
  }
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl)
  }
  previewObjectUrl = URL.createObjectURL(blob)
  previewUrl.value = previewObjectUrl
  void audioRef.value?.load()
}

async function handleApprove(): Promise<void> {
  busy.value = true
  error.value = ''
  const ok = await approveVoiceForgeSample()
  if (!ok) {
    error.value = '预热启动失败，请稍后重试'
    busy.value = false
    return
  }
  setTouchFeedbackMode('custom_corpus')
  emit('approved')
}

function handleDissatisfied(): void {
  step.value = 'reject'
}

async function handleRegenerate(): Promise<void> {
  busy.value = true
  error.value = ''
  const ok = await rejectVoiceForgeSample('regenerate')
  if (!ok) {
    error.value = '重新生成失败'
    busy.value = false
    return
  }
  step.value = 'preview'
  busy.value = false
  emit('regenerating')
}

async function handleSkip(): Promise<void> {
  busy.value = true
  error.value = ''
  const ok = await rejectVoiceForgeSample('skip')
  if (!ok) {
    error.value = '操作失败，请稍后重试'
    busy.value = false
    return
  }
  try {
    if (!window.electronAPI?.cancelVoiceForgeReview) {
      throw new Error('当前环境不支持清理未完成声线')
    }
    await window.electronAPI.cancelVoiceForgeReview()
  } catch (cleanupError) {
    error.value =
      cleanupError instanceof Error ? cleanupError.message : '跳过成功，但未能清理本地声线配置'
    busy.value = false
    return
  }
  setTouchFeedbackMode('curated')
  emit('done')
}

onMounted(() => {
  window.electronAPI?.setIgnoreMouseEvents(false)
  void loadPreviewAudio()
})

onBeforeUnmount(() => {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl)
    previewObjectUrl = null
  }
})
</script>

<template>
  <div class="review-shell" role="dialog" aria-modal="true" @click.stop>
    <div class="review-card" @click.stop>
      <h3 class="title">{{ isUploadSource ? '参考音已导入，请试听效果！' : '生成完毕，请试听效果！' }}</h3>
      <p v-if="status.displayName" class="subtitle">
        声线名称：{{ status.displayName }}
        <span v-if="status.folderId" class="folder-id">（{{ status.folderId }}）</span>
      </p>

      <audio ref="audioRef" class="player" controls :src="previewUrl" />

      <template v-if="step === 'preview'">
        <p class="question">
          {{ isUploadSource ? '您是否对导入的参考音满意？' : '您是否对生成的声线满意？' }}
        </p>
        <div class="actions">
          <button type="button" class="btn btn-primary" :disabled="busy" @click="handleApprove">
            满意，开始预热
          </button>
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="handleDissatisfied">
            不满意
          </button>
        </div>
      </template>

      <template v-else>
        <p v-if="isUploadSource" class="question">上传参考音不满意？</p>
        <p v-else class="question">是否根据当前语料与提示词重新生成？</p>
        <p class="hint">
          {{
            isUploadSource
              ? '上传声线不支持在此重新生成，请返回音色工坊重新上传。跳过将使用精选音频库。'
              : '选择「跳过」将使用精选音频库进入桌宠，可稍后再打开音色工坊修改。'
          }}
        </p>
        <div class="actions">
          <button
            v-if="!isUploadSource"
            type="button"
            class="btn btn-primary"
            :disabled="busy"
            @click="handleRegenerate"
          >
            重新生成并试听
          </button>
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="handleSkip">
            跳过，用精选音频
          </button>
        </div>
      </template>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.review-shell {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: transparent;
  pointer-events: auto;
}

.review-card {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 18px 16px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16);
  overflow: auto;
}

.title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.subtitle {
  margin: 0 0 12px;
  font-size: 12px;
  color: #6b7280;
}

.folder-id {
  color: #9ca3af;
}

.player {
  width: 100%;
  margin-bottom: 12px;
}

.question {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.btn-primary {
  border: none;
  background: linear-gradient(135deg, #ec4899, #f472b6);
  color: #fff;
}

.btn-secondary {
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  color: #374151;
}

.error {
  margin: 10px 0 0;
  font-size: 12px;
  color: #dc2626;
}
</style>
