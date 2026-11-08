<script setup lang="ts">
import { ref, watch } from 'vue'

import {
  cloneCorpusPayload,
  getDefaultCorpusSnapshot,
  setRuntimeCorpus,
  validateCorpusSource
} from '../../services/corpus'
import { setTouchFeedbackMode } from '../../services/touchModeSettings'
import type { BodyPart, CorpusData } from '../../types/corpus'
import VoiceForgeCorpusEditor from './VoiceForgeCorpusEditor.vue'

type FinishedConfig = {
  ttsBackend: 'local' | 'qwen'
  qwen: {
    voices: Array<{ id: string; kind: 'vc' | 'vd'; name: string; voiceId: string; createdAt: number }>
    activeVoiceLocalId: string
    vcModel: string
    vdModel: string
    hasApiKey: boolean
  }
}

const props = defineProps<{
  open: boolean
  localId: string
  voiceName: string
}>()

const emit = defineEmits<{
  finished: [payload: { status: string; config: FinishedConfig }]
  cancel: []
}>()

const corpus = ref<CorpusData>(getDefaultCorpusSnapshot())
const busy = ref(false)
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    corpus.value = getDefaultCorpusSnapshot()
    error.value = ''
    busy.value = false
  }
)

function onCancel(): void {
  if (busy.value) return
  emit('cancel')
}

function addLine(part: BodyPart): void {
  corpus.value[part].push('')
}

function removeLine(part: BodyPart, index: number): void {
  corpus.value[part].splice(index, 1)
}

async function onConfirm(): Promise<void> {
  if (busy.value || !props.localId) return
  const validated = validateCorpusSource(corpus.value)
  if (!validated.ok) {
    error.value = validated.error
    return
  }

  busy.value = true
  error.value = ''
  try {
    const result = await window.electronAPI?.prewarmTtsCloudCorpus?.({
      corpus: cloneCorpusPayload(validated.data),
      localId: props.localId
    })
    if (!result?.ok) {
      error.value = result?.detail || '云端语料预热失败'
      return
    }
    setRuntimeCorpus(cloneCorpusPayload(result.corpus))
    setTouchFeedbackMode(result.touchMode)
    if (result.failures.length) {
      console.warn('[tts-cloud] official clone prewarm failures', result.failures)
    }
    const failHint = result.failed > 0 ? `；失败 ${result.failed} 句（详见控制台）` : ''
    emit('finished', {
      status: `「${props.voiceName}」预热完成：新合成 ${result.synthesized}，跳过 ${result.skipped}，共 ${result.total} 句${failHint}`,
      config: result.config
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : '云端语料预热失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="clone-corpus-mask">
      <div class="clone-corpus-card" role="dialog" aria-modal="true" aria-labelledby="clone-corpus-title">
        <h3 id="clone-corpus-title" class="clone-corpus-card__title">为「{{ voiceName }}」编写触摸语料</h3>
        <p class="clone-corpus-card__hint">
          云端声线已经登记。下面这些台词会用这条声线合成，并写入它自己的触摸缓存。至少留一句。
        </p>
        <div class="clone-corpus-card__editor">
          <VoiceForgeCorpusEditor
            key-prefix="cloud-official-clone"
            :corpus="corpus"
            :disabled="busy"
            @add-line="addLine"
            @remove-line="removeLine"
          />
        </div>
        <p v-if="error" class="clone-corpus-card__error">{{ error }}</p>
        <div class="clone-corpus-card__actions">
          <button type="button" class="clone-corpus-card__btn" :disabled="busy" @click="onCancel">
            稍后
          </button>
          <button type="button" class="clone-corpus-card__btn clone-corpus-card__btn--primary" :disabled="busy" @click="onConfirm">
            {{ busy ? '正在预热…' : '保存并预热' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.clone-corpus-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.35);
}

.clone-corpus-card {
  display: flex;
  flex-direction: column;
  width: min(440px, calc(100vw - 24px));
  max-height: min(80vh, 720px);
  padding: 16px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.clone-corpus-card__title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 650;
  color: #831843;
}

.clone-corpus-card__hint,
.clone-corpus-card__error {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.55;
}

.clone-corpus-card__hint {
  color: #6b7280;
}

.clone-corpus-card__error {
  color: #b91c1c;
}

.clone-corpus-card__editor {
  min-height: 0;
  overflow: auto;
}

.clone-corpus-card__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.clone-corpus-card__btn {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 10px;
  background: #fff;
  color: #374151;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.clone-corpus-card__btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.clone-corpus-card__btn--primary {
  border: none;
  background: linear-gradient(135deg, #ec4899, #f472b6);
  color: #fff;
}
</style>
