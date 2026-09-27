<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import {
  notifyTtsCloudConfigChanged,
  type TtsBackendKind
} from '../../services/ttsCloudSpeech'

const forgeBackend = defineModel<TtsBackendKind>('forgeBackend', { default: 'local' })

const props = withDefaults(
  defineProps<{
    /** 本地 Qwen3 权重就绪时才显示「本地」页 */
    localAvailable?: boolean
  }>(),
  { localAvailable: true }
)

const saving = ref(false)
const error = ref('')

onMounted(() => {
  void reload()
})

watch(
  () => props.localAvailable,
  (available) => {
    if (!available && forgeBackend.value === 'local') {
      void selectBackend('qwen')
    }
  }
)

async function reload(): Promise<void> {
  error.value = ''
  try {
    const result = await window.electronAPI?.getTtsCloudConfig?.()
    if (!result?.ok) {
      error.value = result?.detail || '加载云端 TTS 配置失败'
      return
    }
    let next = result.config.ttsBackend
    if (!props.localAvailable && next === 'local') {
      next = 'qwen'
      const switched = await window.electronAPI?.setTtsCloudConfig?.({ ttsBackend: 'qwen' })
      if (switched?.ok) {
        forgeBackend.value = switched.config.ttsBackend
        notifyTtsCloudConfigChanged(switched.config.ttsBackend)
        return
      }
    }
    forgeBackend.value = next
    notifyTtsCloudConfigChanged(result.config.ttsBackend)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载云端 TTS 配置失败'
  }
}

async function selectBackend(next: TtsBackendKind): Promise<void> {
  if (saving.value || next === forgeBackend.value) return
  if (next === 'local' && !props.localAvailable) {
    error.value = '未检测到本地 Qwen3 模型，无法使用本地工坊'
    return
  }
  saving.value = true
  error.value = ''
  const prev = forgeBackend.value
  forgeBackend.value = next
  try {
    const result = await window.electronAPI?.setTtsCloudConfig?.({ ttsBackend: next })
    if (!result?.ok) {
      forgeBackend.value = prev
      error.value = result?.detail || '切换失败'
      return
    }
    forgeBackend.value = result.config.ttsBackend
    notifyTtsCloudConfigChanged(result.config.ttsBackend)
  } catch (err) {
    forgeBackend.value = prev
    error.value = err instanceof Error ? err.message : '切换失败'
  } finally {
    saving.value = false
  }
}

defineExpose({ reload })
</script>

<template>
  <div class="vf-backend">
    <div v-if="localAvailable" class="vf-backend__tabs" role="tablist" aria-label="音色工坊推理后端">
      <button
        type="button"
        class="vf-backend__tab"
        :class="{ 'vf-backend__tab--active': forgeBackend === 'local' }"
        role="tab"
        :aria-selected="forgeBackend === 'local'"
        :disabled="saving"
        @click="selectBackend('local')"
      >
        本地
      </button>
      <button
        type="button"
        class="vf-backend__tab"
        :class="{ 'vf-backend__tab--active': forgeBackend === 'qwen' }"
        role="tab"
        :aria-selected="forgeBackend === 'qwen'"
        :disabled="saving"
        @click="selectBackend('qwen')"
      >
        云端
      </button>
    </div>
    <p v-else class="vf-backend__hint">
      未检测到本地 Qwen3 模型，已仅显示云端音色工坊。需要本地页时请运行
      scripts\win\install-qwen-models.cmd
    </p>
    <p v-if="error" class="vf-backend__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.vf-backend {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vf-backend__tabs {
  display: flex;
  gap: 8px;
}

.vf-backend__tab {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  background: #f3f4f6;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.vf-backend__tab--active {
  background: #fff;
  border-color: rgba(236, 72, 153, 0.35);
  color: #db2777;
  box-shadow: 0 1px 4px rgba(236, 72, 153, 0.12);
}

.vf-backend__tab:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.vf-backend__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7280;
}

.vf-backend__error {
  margin: 0;
  font-size: 12px;
  color: #b91c1c;
}
</style>
