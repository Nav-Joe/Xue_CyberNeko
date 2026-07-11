<script setup lang="ts">
import {
  EXPERIMENTAL_UPLOAD_HINT,
  EXPERIMENTAL_UPLOAD_LABEL,
  EXPERIMENTAL_UPLOAD_WARNING,
  GENERATE_VOICE_LABEL,
  UPLOAD_VOICE_BUTTON_LABEL,
  VOICE_FORGE_CREATE_INTRO,
  VOICE_INSTRUCT_HINT,
  VOICE_INSTRUCT_LABEL
} from '../../../constants/voiceForge'
import type { BodyPart, CorpusData } from '../../../types/corpus'
import VoiceForgeCorpusEditor from '../VoiceForgeCorpusEditor.vue'

defineProps<{
  instruct: string
  createCorpus: CorpusData
  experimentalUploadEnabled: boolean
  experimentalUploadSaving: boolean
  applying: boolean
  uploadingVoice: boolean
  creationStatus: string
}>()

const emit = defineEmits<{
  'update:instruct': [value: string]
  generate: []
  'toggle-experimental': [event: Event]
  'start-upload': []
  'add-line': [part: BodyPart]
  'remove-line': [part: BodyPart, index: number]
}>()
</script>

<template>
  <div class="tab-panel">
    <div class="experimental-bar">
      <label class="experimental-toggle">
        <input
          type="checkbox"
          :checked="experimentalUploadEnabled"
          :disabled="experimentalUploadSaving || applying || uploadingVoice"
          @change="emit('toggle-experimental', $event)"
        />
        <span class="experimental-toggle__label">{{ EXPERIMENTAL_UPLOAD_LABEL }}</span>
      </label>
      <p class="experimental-warning">{{ EXPERIMENTAL_UPLOAD_WARNING }}</p>
      <p v-if="experimentalUploadEnabled" class="hint experimental-hint">{{ EXPERIMENTAL_UPLOAD_HINT }}</p>
      <button
        v-if="experimentalUploadEnabled"
        type="button"
        class="upload-btn upload-btn--primary"
        :disabled="applying || uploadingVoice"
        @click="emit('start-upload')"
      >
        {{ uploadingVoice ? '导入中…' : UPLOAD_VOICE_BUTTON_LABEL }}
      </button>
    </div>

    <p class="intro">{{ VOICE_FORGE_CREATE_INTRO }}</p>

    <section class="section">
      <h3 class="section-title">{{ VOICE_INSTRUCT_LABEL }}</h3>
      <p class="hint">{{ VOICE_INSTRUCT_HINT }}</p>
      <textarea
        :value="instruct"
        class="instruct-textarea"
        rows="5"
        spellcheck="false"
        placeholder="例如：中文少女，音色偏低偏软，轻声细语，文静内敛…"
        @input="emit('update:instruct', ($event.target as HTMLTextAreaElement).value)"
      />
    </section>

    <section class="section">
      <h3 class="section-title">触摸台词</h3>
      <p class="hint">生成声线后，这些台词会用于克隆预热与桌宠触摸反馈。</p>

      <VoiceForgeCorpusEditor
        key-prefix="create"
        :corpus="createCorpus"
        :disabled="applying || uploadingVoice"
        @add-line="emit('add-line', $event)"
        @remove-line="(part, index) => emit('remove-line', part, index)"
      />
    </section>

    <p v-if="creationStatus" class="status ready">{{ creationStatus }}</p>
    <button type="button" class="apply-btn" :disabled="applying || uploadingVoice" @click="emit('generate')">
      {{ applying ? '处理中…' : GENERATE_VOICE_LABEL }}
    </button>
  </div>
</template>

<style scoped>
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.intro {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #6b7280;
}

.section {
  padding-top: 4px;
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7280;
}

.instruct-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  font-size: 12px;
  line-height: 1.5;
  color: #111827;
  resize: vertical;
  min-height: 96px;
}

.experimental-bar {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(220, 38, 38, 0.25);
  background: rgba(254, 242, 242, 0.9);
}

.experimental-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.experimental-toggle__label {
  font-size: 13px;
  font-weight: 700;
  color: #b91c1c;
}

.experimental-warning {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  font-weight: 700;
  color: #dc2626;
}

.experimental-hint {
  margin-top: 6px;
}

.upload-btn {
  width: 100%;
  margin-top: 8px;
  padding: 10px 14px;
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: 10px;
  background: #fff7ed;
  color: #b45309;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.upload-btn--primary {
  margin-top: 10px;
}

.upload-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.status {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.status.ready {
  color: #059669;
}

.apply-btn {
  width: 100%;
  margin-top: 4px;
  padding: 11px 14px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #ec4899, #f472b6);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.apply-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}
</style>
