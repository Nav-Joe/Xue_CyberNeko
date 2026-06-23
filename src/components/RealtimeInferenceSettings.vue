<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  REALTIME_INFERENCE_CUSTOM_HINT,
  REALTIME_INFERENCE_HINT,
  REALTIME_INFERENCE_LABEL,
  REALTIME_INFERENCE_NEED_ACTIVE_HINT,
  REALTIME_INFERENCE_OFFICIAL_HINT
} from '../constants/voiceForge'
import { setRuntimeCorpus } from '../services/corpus'
import { setRealtimeInferenceEnabled } from '../services/ttsSettings'
import { setTouchFeedbackMode } from '../services/touchModeSettings'
import { loadTtsCapabilities } from '../services/ttsCapabilities'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
  }>(),
  { disabled: false }
)

const enabled = ref(false)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const activeSampleName = ref<string | null>(null)
const activeSampleKind = ref<'official' | 'custom' | null>(null)
const hasActiveReference = ref(false)

let unbindVoiceSamplesChanged: (() => void) | null = null

const contextHint = computed(() => {
  if (!hasActiveReference.value) {
    return REALTIME_INFERENCE_NEED_ACTIVE_HINT
  }
  if (activeSampleKind.value === null && activeSampleName.value?.includes('第三方')) {
    return '当前为第三方引擎语料：开启后每次点击走实时推理；关闭则优先使用预热缓存。'
  }
  if (activeSampleKind.value === 'official') {
    return REALTIME_INFERENCE_OFFICIAL_HINT
  }
  if (activeSampleKind.value === 'custom') {
    return REALTIME_INFERENCE_CUSTOM_HINT
  }
  return REALTIME_INFERENCE_NEED_ACTIVE_HINT
})

const canToggle = computed(
  () => !props.disabled && hasActiveReference.value && !loading.value && !saving.value
)

async function refreshState(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (!window.electronAPI?.readVoiceForgeConfig) {
      hasActiveReference.value = false
      enabled.value = false
      return
    }

    const config = await window.electronAPI.readVoiceForgeConfig()
    if (config.mode === 'alt_engine_corpus') {
      hasActiveReference.value = true
      activeSampleName.value = '第三方引擎语料'
      activeSampleKind.value = null
    } else {
      const active = config.activeSample
      activeSampleName.value = active?.displayName ?? null
      activeSampleKind.value =
        active?.kind ?? (active?.folderId === 'default_sample' ? 'official' : active ? 'custom' : null)

      if (window.electronAPI.listVoiceSamples && active?.folderId) {
        const samples = await window.electronAPI.listVoiceSamples()
        const match = samples.find((item) => item.folderId === active.folderId)
        hasActiveReference.value = Boolean(match?.hasReference)
      } else {
        hasActiveReference.value = false
      }
    }

    if (window.electronAPI.readRealtimeInferenceFlag) {
      const flag = await window.electronAPI.readRealtimeInferenceFlag()
      enabled.value = flag.enabled
      setRealtimeInferenceEnabled(flag.enabled)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取配置失败'
    hasActiveReference.value = false
  } finally {
    loading.value = false
  }
}

async function handleToggle(): Promise<void> {
  if (!canToggle.value) {
    return
  }

  const next = !enabled.value
  saving.value = true
  error.value = ''

  try {
    if (!window.electronAPI?.setRealtimeTouchInference) {
      throw new Error('当前环境不支持触摸实时推理')
    }

    const result = await window.electronAPI.setRealtimeTouchInference(next)
    enabled.value = result.enabled
    setRealtimeInferenceEnabled(result.enabled)
    activeSampleName.value = result.activeSampleName
    activeSampleKind.value = result.activeSampleKind

    if (next) {
      setTouchFeedbackMode(result.touchMode)

      if (window.electronAPI.readVoiceForgeConfig) {
        const config = await window.electronAPI.readVoiceForgeConfig()
        setRuntimeCorpus(config.corpus)
      }
    }

    window.dispatchEvent(new CustomEvent('pet-settings-close'))

    if (!window.electronAPI?.beginVoiceEngineLoad) {
      throw new Error('当前环境不支持语音引擎加载')
    }

    let loadMode: 'curated' | 'engine' | 'realtime' = next ? 'realtime' : 'curated'
    if (!next && result.touchMode !== 'curated') {
      // 关闭实时推理时克隆引擎通常已挂载；只等引擎就绪，不等后台 prewarm 轮询
      loadMode = 'engine'
    }
    const loadResult = await window.electronAPI.beginVoiceEngineLoad({
      title: next ? '开启触摸实时推理' : '关闭触摸实时推理',
      message: next
        ? '正在切换实时推理喵~'
        : loadMode === 'curated'
          ? '正在切换…'
          : '正在切换回语料缓存播放…',
      mode: loadMode,
      expectedTouchMode: result.touchMode
    })

    if (!loadResult.ok) {
      throw new Error('TTS 未能完成加载，请确认 TTS 窗口正在运行')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '切换失败'
    await refreshState()
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void refreshState()
  unbindVoiceSamplesChanged =
    window.electronAPI?.onVoiceSamplesChanged?.(() => {
      void refreshState()
    }) ?? null
})

onUnmounted(() => {
  unbindVoiceSamplesChanged?.()
})
</script>

<template>
  <section class="realtime-settings">
    <p class="section-label">触摸反馈</p>
    <div class="setting-card">
      <div class="setting-row">
        <span class="label">{{ REALTIME_INFERENCE_LABEL }}</span>
        <button
          type="button"
          class="ios-switch"
          :class="{ 'ios-switch--on': enabled }"
          role="switch"
          :aria-checked="enabled"
          :disabled="!canToggle"
          @click="handleToggle"
        >
          <span class="ios-switch__track">
            <span class="ios-switch__knob" />
          </span>
        </button>
      </div>
      <p v-if="loading" class="hint">加载中…</p>
      <p v-else-if="disabled" class="hint">当前 TTS 引擎不支持 Qwen 克隆/实时推理相关功能。</p>
      <p v-else class="hint">{{ REALTIME_INFERENCE_HINT }}</p>
      <p v-if="activeSampleName && hasActiveReference" class="hint active">
        当前桌宠声线：{{ activeSampleName }}
      </p>
      <p v-if="!loading" class="hint context">{{ contextHint }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.realtime-settings {
  margin: 0 0 12px;
}

.section-label {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}

.setting-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
}

.hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7280;
}

.hint.active {
  color: #374151;
}

.hint.context {
  color: #9ca3af;
}

.error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #dc2626;
}

.ios-switch {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.ios-switch:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ios-switch__track {
  display: block;
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: #d1d5db;
  position: relative;
  transition: background 0.2s ease;
}

.ios-switch--on .ios-switch__track {
  background: #ec4899;
}

.ios-switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transition: transform 0.2s ease;
}

.ios-switch--on .ios-switch__knob {
  transform: translateX(18px);
}
</style>
