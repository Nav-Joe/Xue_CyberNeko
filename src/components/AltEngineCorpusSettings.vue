<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  BODY_PART_HINTS,
  BODY_PART_LABELS,
  BODY_PART_ORDER,
  SAVE_AND_PREWARM_LABEL
} from '../constants/voiceForge'
import {
  getDefaultCorpusSnapshot,
  setRuntimeCorpus,
  validateCorpusData
} from '../services/corpus'
import { setTouchFeedbackMode } from '../services/touchModeSettings'
import type { BodyPart, CorpusData } from '../types/corpus'

const props = defineProps<{
  engineName: string
}>()

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const active = ref(false)
const corpus = reactive<CorpusData>(getDefaultCorpusSnapshot())
const baseline = ref<CorpusData>(getDefaultCorpusSnapshot())

const hasChanges = computed(() => JSON.stringify(corpus) !== JSON.stringify(baseline.value))

function addLine(part: BodyPart): void {
  corpus[part].push('')
}

function removeLine(part: BodyPart, index: number): void {
  corpus[part].splice(index, 1)
}

async function refreshState(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (!window.electronAPI?.readTouchConfig) {
      return
    }
    const config = await window.electronAPI.readTouchConfig()
    active.value = config.mode === 'alt_engine_corpus'
    Object.assign(corpus, config.corpus)
    baseline.value = structuredClone(config.corpus)
    if (active.value) {
      setRuntimeCorpus(config.corpus)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取语料失败'
  } finally {
    loading.value = false
  }
}

async function applyAndPrewarm(): Promise<void> {
  if (saving.value || loading.value) {
    return
  }

  const validated = validateCorpusData(corpus)
  if (!validated.ok) {
    error.value = validated.error
    return
  }

  const confirmed = window.electronAPI?.showConfirmDialog
    ? await window.electronAPI.showConfirmDialog({
        title: '保存并预热第三方引擎语料',
        message: `将使用 ${props.engineName} 引擎合成语料缓存，桌宠会暂时隐藏并显示进度。确定吗？`,
        confirmLabel: '确定'
      })
    : window.confirm('确定保存并预热语料吗？')
  if (!confirmed) {
    return
  }

  saving.value = true
  error.value = ''
  try {
    if (!window.electronAPI?.applyAltEngineCorpus) {
      throw new Error('当前环境不支持第三方引擎语料')
    }
    const result = await window.electronAPI.applyAltEngineCorpus(validated.data)
    setTouchFeedbackMode(result.mode)
    setRuntimeCorpus(validated.data)
    baseline.value = structuredClone(validated.data)
    active.value = true

    if (!window.electronAPI.beginVoiceEngineLoad) {
      throw new Error('当前环境不支持语音引擎加载')
    }
    const loadResult = await window.electronAPI.beginVoiceEngineLoad({
      title: '第三方引擎语料预热',
      message: '正在预热语料缓存…',
      mode: 'prewarm',
      expectedTouchMode: 'alt_engine_corpus',
      syncMessage: '正在同步第三方引擎语料…'
    })
    if (!loadResult.ok) {
      throw new Error('TTS 未能完成预热，请确认 TTS 窗口正在运行')
    }
    window.dispatchEvent(new CustomEvent('pet-settings-close'))
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function disableAltCorpus(): Promise<void> {
  if (saving.value || loading.value || !active.value) {
    return
  }
  saving.value = true
  error.value = ''
  try {
    if (!window.electronAPI?.disableAltEngineCorpus) {
      throw new Error('当前环境不支持此操作')
    }
    const result = await window.electronAPI.disableAltEngineCorpus()
    setTouchFeedbackMode(result.touchMode)
    active.value = false
    await refreshState()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '关闭失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void refreshState()
})
</script>

<template>
  <section class="alt-engine-corpus">
    <p class="section-label">第三方引擎语料</p>
    <div class="setting-card">
      <p class="hint">
        当前 TTS 引擎为 <strong>{{ engineName }}</strong>。可编辑触摸语料并用该引擎预热缓存；缓存保存在
        <code>voice_forge/other_custom_cache/{{ engineName }}/</code>，与 Qwen 音色工坊隔离。
      </p>
      <p v-if="active" class="status-active">已启用第三方引擎语料模式</p>
      <p v-if="loading" class="hint">加载中…</p>

      <p v-else class="engine-info">
        当前运行 {{ engineName }} 引擎。可在下方编辑语料并用该引擎预热缓存（与 Qwen 音色工坊无关）。
      </p>

      <div v-if="!loading" class="corpus-editor">
        <div v-for="part in BODY_PART_ORDER" :key="part" class="part-block">
          <div class="part-head">
            <span class="part-label">{{ BODY_PART_LABELS[part] }}</span>
            <span class="part-hint">{{ BODY_PART_HINTS[part] }}</span>
          </div>
          <div v-if="corpus[part].length === 0" class="empty-lines">暂无台词，点击下方添加</div>
          <div v-for="(_line, index) in corpus[part]" :key="`${part}-${index}`" class="line-row">
            <input
              v-model="corpus[part][index]"
              class="line-input"
              type="text"
              maxlength="200"
              :placeholder="`第 ${index + 1} 句`"
            />
            <button type="button" class="line-remove" aria-label="删除" @click="removeLine(part, index)">
              ×
            </button>
          </div>
          <button type="button" class="line-add" @click="addLine(part)">+ 添加一句</button>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="actions">
        <button
          type="button"
          class="apply-btn"
          :disabled="saving || loading || !hasChanges"
          @click="applyAndPrewarm"
        >
          {{ saving ? '处理中…' : SAVE_AND_PREWARM_LABEL }}
        </button>
        <button
          v-if="active"
          type="button"
          class="secondary-btn"
          :disabled="saving || loading"
          @click="disableAltCorpus"
        >
          恢复精选音频
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.alt-engine-corpus {
  margin: 0 0 12px;
}

.section-label {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
}

.setting-card {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: #fafafa;
}

.hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7280;
}

.status-active {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: #059669;
}

.part-block {
  margin-bottom: 12px;
}

.part-head {
  margin-bottom: 6px;
}

.part-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.part-hint {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #9ca3af;
}

.empty-lines {
  margin-bottom: 6px;
  font-size: 12px;
  color: #9ca3af;
}

.line-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.line-input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  font-size: 12px;
}

.line-remove {
  width: 28px;
  border: none;
  border-radius: 8px;
  background: #fee2e2;
  color: #dc2626;
  cursor: pointer;
}

.line-add {
  margin-top: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 8px;
  background: #f3f4f6;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.apply-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  background: #ec4899;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.apply-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #d1d5db;
  color: #6b7280;
}

.secondary-btn {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #dc2626;
}

.engine-info {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #eff6ff;
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #1d4ed8;
  font-size: 12px;
  line-height: 1.55;
}
</style>
