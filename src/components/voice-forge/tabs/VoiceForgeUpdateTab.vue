<script setup lang="ts">
import {
  CORPUS_EDITING_LABEL,
  CORPUS_PER_SAMPLE_HINT,
  CORPUS_PREWARM_HINT,
  SAVE_AND_PREWARM_LABEL,
  VOICE_FORGE_UPDATE_INTRO
} from '../../../constants/voiceForge'
import type { VoiceSampleItem } from '../../../composables/voice-forge/types'
import type { BodyPart, CorpusData } from '../../../types/corpus'
import VoiceForgeCorpusEditor from '../VoiceForgeCorpusEditor.vue'

defineProps<{
  voiceSamples: VoiceSampleItem[]
  editingSampleId: string
  editingSampleLabel: string
  loadingSampleCorpus: boolean
  applying: boolean
  applyingCorpus: boolean
  updateCorpus: CorpusData
  canApplyCorpusPrewarm: boolean
  corpusPrewarmDisabledReason: string
}>()

const emit = defineEmits<{
  'update:editingSampleId': [folderId: string]
  prewarm: []
  'add-line': [part: BodyPart]
  'remove-line': [part: BodyPart, index: number]
}>()
</script>

<template>
  <div class="tab-panel">
    <p class="intro">{{ VOICE_FORGE_UPDATE_INTRO }}</p>

    <section class="section">
      <div class="section-head-row">
        <h3 class="section-title">触摸台词</h3>
        <label class="sample-picker">
          <span class="sample-picker__label">{{ CORPUS_EDITING_LABEL }}</span>
          <select
            :value="editingSampleId"
            class="sample-select"
            :disabled="applyingCorpus || applying || loadingSampleCorpus"
            @change="emit('update:editingSampleId', ($event.target as HTMLSelectElement).value)"
          >
            <option v-if="voiceSamples.length === 0" value="">暂无可选声线</option>
            <option
              v-for="item in voiceSamples"
              :key="item.folderId"
              :value="item.folderId"
              :disabled="!item.hasReference"
            >
              {{ item.displayName }}（{{ item.kind === 'official' ? '官方' : '自定义' }}）
              {{ item.hasReference ? '' : ' · 未就绪' }}
            </option>
          </select>
        </label>
      </div>
      <p class="hint">{{ CORPUS_PER_SAMPLE_HINT }}</p>
      <p v-if="loadingSampleCorpus" class="hint">正在加载「{{ editingSampleLabel }}」的语料…</p>

      <VoiceForgeCorpusEditor
        key-prefix="update"
        :corpus="updateCorpus"
        :disabled="applyingCorpus || applying || loadingSampleCorpus"
        @add-line="emit('add-line', $event)"
        @remove-line="(part, index) => emit('remove-line', part, index)"
      />
    </section>

    <p v-if="corpusPrewarmDisabledReason" class="hint corpus-prewarm-reason">{{ corpusPrewarmDisabledReason }}</p>
    <p v-else class="hint">{{ CORPUS_PREWARM_HINT }}</p>
    <button
      type="button"
      class="apply-btn"
      :disabled="!canApplyCorpusPrewarm || applyingCorpus || applying"
      @click="emit('prewarm')"
    >
      {{ applyingCorpus ? '处理中…' : SAVE_AND_PREWARM_LABEL }}
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

.section-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.sample-picker {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.sample-picker__label {
  font-size: 11px;
  color: #6b7280;
}

.hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7280;
}

.sample-select {
  min-width: 148px;
  max-width: 180px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  font-size: 12px;
  color: #111827;
}

.corpus-prewarm-reason {
  margin-top: 0;
  margin-bottom: 0;
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
