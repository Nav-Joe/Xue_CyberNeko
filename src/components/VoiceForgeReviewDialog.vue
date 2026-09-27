<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  approveVoiceForgeSample,
  fetchVoiceForgePreviewBlob,
  rejectVoiceForgeSample,
  type VoiceForgeStatus
} from '../services/voiceForgeApi'
import { setTouchFeedbackMode } from '../services/touchModeSettings'
import {
  requestCloudVoiceApprove,
  requestCloudVoiceRegenerate
} from '../app/voiceForgeReviewBridge'

const props = defineProps<{
  status: VoiceForgeStatus
  /** 云端 approve 失败后恢复审阅时展示 */
  initialError?: string
}>()

const isUploadSource = computed(() => props.status.source === 'upload')
const isCloud = computed(
  () => props.status.backend === 'cloud' || props.status.flow === 'cloud_create'
)

const emit = defineEmits<{
  approved: []
  done: []
  regenerating: [detail: import('../app/composables/useVoiceEventBus').CloudVoiceForgeStartDetail | null]
}>()

const step = ref<'preview' | 'reject'>('preview')
const busy = ref(false)
const error = ref('')
const audioRef = ref<HTMLAudioElement | null>(null)
const previewUrl = ref('')
let previewObjectUrl: string | null = null

async function loadPreviewAudio(): Promise<void> {
  error.value = ''
  let blob: Blob | null = null
  if (isCloud.value) {
    const result = await window.electronAPI?.getTtsCloudPendingPreview?.()
    if (result?.ok) {
      blob = new Blob([result.audio], { type: result.mime || 'audio/wav' })
    }
  } else {
    blob = await fetchVoiceForgePreviewBlob()
  }
  if (!blob) {
    error.value = isCloud.value
      ? '试听音频加载失败'
      : '试听音频加载失败，请确认 TTS 服务正在运行'
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
  error.value = ''
  if (isCloud.value) {
    // 与重新生成相同：先把控制权交给 PetApp 切预热遮罩，再由主进程 approve+prewarm
    const accepted = requestCloudVoiceApprove()
    if (!accepted) {
      error.value = '无法确认：桌宠侧未就绪，请关闭后重试'
    }
    return
  }

  // 兜底：若 status 未标 cloud 但仍有云端暂存，同样走 bridge
  if (window.electronAPI?.getTtsCloudPendingStatus) {
    try {
      const pending = await Promise.race([
        window.electronAPI.getTtsCloudPendingStatus(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 400))
      ])
      if (
        pending &&
        typeof pending === 'object' &&
        'ok' in pending &&
        pending.ok &&
        pending.status?.review_pending
      ) {
        const accepted = requestCloudVoiceApprove()
        if (!accepted) {
          error.value = '无法确认：桌宠侧未就绪，请关闭后重试'
        }
        return
      }
    } catch {
      /* fall through to local */
    }
  }

  busy.value = true
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
  error.value = ''

  let cloud = isCloud.value
  if (!cloud && window.electronAPI?.getTtsCloudPendingStatus) {
    try {
      const pending = await Promise.race([
        window.electronAPI.getTtsCloudPendingStatus(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 400))
      ])
      cloud = Boolean(
        pending &&
          typeof pending === 'object' &&
          'ok' in pending &&
          pending.ok &&
          pending.status?.review_pending
      )
    } catch {
      /* ignore */
    }
  }

  if (cloud) {
    // 不要先 busy：同步把控制权交给 PetApp 卸载本窗并显示加载遮罩
    const accepted = requestCloudVoiceRegenerate()
    if (!accepted) {
      error.value = '无法重新生成：桌宠侧未就绪，请关闭后重试创造'
    }
    return
  }

  busy.value = true
  const ok = await rejectVoiceForgeSample('regenerate')
  if (!ok) {
    error.value = '重新生成失败'
    busy.value = false
    return
  }
  step.value = 'preview'
  busy.value = false
  emit('regenerating', null)
}

async function handleSkip(): Promise<void> {
  busy.value = true
  error.value = ''
  if (isCloud.value) {
    const result = await window.electronAPI?.rejectTtsCloudPending?.({ action: 'skip' })
    if (!result?.ok) {
      error.value = result?.detail || '操作失败'
      busy.value = false
      return
    }
    setTouchFeedbackMode('curated')
    emit('done')
    return
  }
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

function applyInitialError(): void {
  const msg = props.initialError?.trim()
  if (msg) error.value = msg
}

onMounted(() => {
  window.electronAPI?.setIgnoreMouseEvents(false)
  // loadPreviewAudio 会先清空 error，结束后再贴回 approve 失败文案
  void loadPreviewAudio().finally(() => applyInitialError())
})

watch(
  () => props.initialError,
  () => applyInitialError()
)

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
            isCloud
              ? isUploadSource
                ? '云端克隆不满意时请返回工坊重新上传。跳过将不启用该暂存音色。'
                : '选择「跳过」将丢弃本次云端设计（尽量从百炼删除），可稍后再打开音色工坊重试。'
              : isUploadSource
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
            {{ isCloud ? '跳过，不启用该音色' : '跳过，用精选音频' }}
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
