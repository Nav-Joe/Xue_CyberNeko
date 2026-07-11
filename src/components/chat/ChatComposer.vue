<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  disabled?: boolean
  sending?: boolean
}>()

const emit = defineEmits<{
  submit: [text: string]
}>()

const draft = ref('')

function onSubmit(): void {
  const text = draft.value.trim()
  if (!text || props.disabled || props.sending) return
  emit('submit', text)
  draft.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    onSubmit()
  }
}
</script>

<template>
  <form class="chat-composer" @submit.prevent="onSubmit">
    <label class="chat-composer__label" for="chat-composer-input">输入消息</label>
    <textarea
      id="chat-composer-input"
      v-model="draft"
      class="chat-composer__input"
      rows="3"
      placeholder="Enter 发送，Shift+Enter 换行"
      :disabled="disabled || sending"
      @keydown="onKeydown"
    />
    <div class="chat-composer__actions">
      <button type="submit" class="chat-composer__send" :disabled="disabled || sending || !draft.trim()">
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
  padding: 10px 12px;
  border: 1px solid #fbcfe8;
  border-radius: 12px;
  background: #fff;
  color: #111827;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  min-height: 72px;
}

.chat-composer__input:focus {
  outline: 2px solid #f9a8d4;
  outline-offset: 1px;
}

.chat-composer__input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.chat-composer__actions {
  display: flex;
  justify-content: flex-end;
}

.chat-composer__send {
  padding: 8px 16px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #f472b6, #be185d);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(190, 24, 93, 0.22);
}

.chat-composer__send:hover:not(:disabled) {
  filter: brightness(1.04);
}

.chat-composer__send:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
