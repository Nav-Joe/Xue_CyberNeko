<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ChatSttPhase } from '../../composables/chat/useChatStt'
import ChatSttLevelMeter from './ChatSttLevelMeter.vue'

const props = defineProps<{
  disabled?: boolean
  sending?: boolean
  /** 忙线提示（如朗读中）；优先于 sttStatusHint 展示在左侧 */
  gateHint?: string
  sttEnabled?: boolean
  sttPhase?: ChatSttPhase
  sttStatusHint?: string
  sttPreparing?: boolean
  /** 录音电平 0..1 */
  sttLevel?: number
}>()

const emit = defineEmits<{
  submit: [text: string]
  'stt-start': []
  'stt-finish': []
}>()

const draft = ref('')

const inputLocked = computed(
  () =>
    Boolean(props.sttPreparing) ||
    props.sttPhase === 'recording' ||
    props.sttPhase === 'recognizing'
)

const fieldDisabled = computed(
  () => Boolean(props.disabled || props.sending || inputLocked.value)
)

const showLevel = computed(() => props.sttEnabled && props.sttPhase === 'recording')

const placeholder = computed(() => {
  if (props.gateHint) return props.gateHint
  if (props.sttPhase === 'recording') return '正在录音…点击「结束」交卷'
  if (props.sttPhase === 'recognizing') return '识别中'
  return 'Enter 发送，Shift+Enter 换行'
})

const leftHint = computed(() => props.gateHint || props.sttStatusHint || '')

function appendDraft(text: string): void {
  const piece = text.trim()
  if (!piece) return
  const cur = draft.value
  if (!cur.trim()) {
    draft.value = piece
    return
  }
  const needsSpace = !/\s$/.test(cur) && !/^\s/.test(piece)
  draft.value = needsSpace ? `${cur} ${piece}` : `${cur}${piece}`
}

function onSubmit(): void {
  const text = draft.value.trim()
  if (!text || props.disabled || props.sending || inputLocked.value) return
  emit('submit', text)
  draft.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (inputLocked.value) {
    event.preventDefault()
    return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    onSubmit()
  }
}

defineExpose({ appendDraft })
</script>

<template>
  <form class="chat-composer" @submit.prevent="onSubmit">
    <label class="chat-composer__label" for="chat-composer-input">输入消息</label>
    <textarea
      id="chat-composer-input"
      v-model="draft"
      class="chat-composer__input"
      rows="3"
      :placeholder="placeholder"
      :disabled="fieldDisabled"
      :readonly="inputLocked"
      @keydown="onKeydown"
    />
    <div class="chat-composer__actions">
      <div v-if="showLevel || leftHint" class="chat-composer__stt-left">
        <ChatSttLevelMeter v-if="showLevel" :level="sttLevel ?? 0" />
        <p v-if="leftHint" class="chat-composer__stt-hint" role="status">{{ leftHint }}</p>
      </div>
      <template v-if="sttEnabled">
        <button
          v-if="sttPhase === 'idle' && !sttPreparing"
          type="button"
          class="chat-composer__mic"
          :disabled="disabled || sending"
          aria-label="语音输入"
          title="语音输入"
          @click="emit('stt-start')"
        >
          <!-- 图标风格参考 Heroicons microphone (MIT) -->
          <svg class="chat-composer__mic-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Zm7 10a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z"
            />
          </svg>
        </button>
        <button
          v-else-if="sttPhase === 'recording'"
          type="button"
          class="chat-composer__mic chat-composer__mic--recording"
          title="结束录音并识别"
          @click="emit('stt-finish')"
        >
          结束
        </button>
        <button
          v-else
          type="button"
          class="chat-composer__mic"
          disabled
          :title="sttPreparing ? '准备中' : '识别中'"
        >
          {{ sttPreparing ? '准备中' : '识别中' }}
        </button>
      </template>
      <button
        type="submit"
        class="chat-composer__send"
        :disabled="disabled || sending || inputLocked || !draft.trim()"
      >
        {{ sending ? '发送中…' : '发送' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.chat-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--home-radius-control, 16px);
  background: var(--home-color-panel, #fff);
  border: 1.5px solid var(--home-accent-soft, rgba(219, 39, 119, 0.16));
  box-shadow: 0 8px 20px rgba(159, 18, 57, 0.08);
}

.chat-composer__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.chat-composer__input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: var(--home-radius-control, 16px);
  background: var(--home-color-inset, #fff7fb);
  color: var(--home-color-text, #3f2a33);
  font-size: var(--home-font-body, 1rem);
  line-height: 1.55;
  resize: vertical;
  min-height: 80px;
}

.chat-composer__input:focus {
  outline: 2px solid var(--home-focus, #9f1239);
  outline-offset: 2px;
}

.chat-composer__input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.chat-composer__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-composer__stt-left {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  min-width: 0;
  flex: 1 1 auto;
}

.chat-composer__stt-hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--home-color-muted, #5c4150);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chat-composer__mic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--home-target, 44px);
  height: var(--home-target, 44px);
  padding: 0 12px;
  border: 1.5px solid var(--home-color-primary, #9f1239);
  border-radius: 999px;
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-primary, #9f1239);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
}

.chat-composer__mic-icon {
  width: 18px;
  height: 18px;
  display: block;
}

.chat-composer__mic:hover:not(:disabled) {
  background: var(--home-color-chip, #fde8f0);
}

.chat-composer__mic--recording {
  padding: 0 14px;
  background: var(--home-color-accent, #db2777);
  border-color: var(--home-color-accent, #db2777);
  color: var(--home-color-on-accent, #fff);
}

.chat-composer__mic:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.chat-composer__send {
  min-height: var(--home-target, 44px);
  padding: 8px 20px;
  border: none;
  border-radius: var(--home-radius-pill, 999px);
  background: var(--home-color-accent, #db2777);
  color: var(--home-color-on-accent, #fff);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 16px rgba(219, 39, 119, 0.22);
}

.chat-composer__send:hover:not(:disabled) {
  filter: brightness(1.05);
}

.chat-composer__send:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
