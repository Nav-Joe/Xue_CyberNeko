<script setup lang="ts">
import { BODY_PART_HINTS, BODY_PART_LABELS, BODY_PART_ORDER } from '../../constants/voiceForge'
import type { BodyPart, CorpusData } from '../../types/corpus'

defineProps<{
  corpus: CorpusData
  disabled?: boolean
  keyPrefix?: string
}>()

const emit = defineEmits<{
  'add-line': [part: BodyPart]
  'remove-line': [part: BodyPart, index: number]
}>()
</script>

<template>
  <div v-for="part in BODY_PART_ORDER" :key="`${keyPrefix ?? 'corpus'}-${part}`" class="part-block">
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
        :disabled="disabled"
        :placeholder="`第 ${index + 1} 句`"
      />
      <button
        type="button"
        class="line-remove"
        aria-label="删除"
        :disabled="disabled"
        @click="emit('remove-line', part, index)"
      >
        ×
      </button>
    </div>

    <button type="button" class="line-add" :disabled="disabled" @click="emit('add-line', part)">
      + 添加一句
    </button>
  </div>
</template>

<style scoped>
.part-block {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.part-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}

.part-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.part-hint {
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.45;
}

.empty-lines {
  margin-bottom: 8px;
  font-size: 12px;
  color: #9ca3af;
}

.line-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.line-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  font-size: 12px;
  color: #111827;
}

.line-remove {
  flex-shrink: 0;
  width: 32px;
  border: none;
  border-radius: 8px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.line-remove:disabled,
.line-add:disabled,
.line-input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.line-add {
  width: 100%;
  padding: 8px 10px;
  border: 1px dashed rgba(236, 72, 153, 0.35);
  border-radius: 8px;
  background: #fff;
  color: #db2777;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>
