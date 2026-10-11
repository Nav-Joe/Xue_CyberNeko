<script setup lang="ts">
import { computed } from 'vue'

import type { ChatUiMessage } from '../../services/chat/types'

const props = defineProps<{
  messages: ChatUiMessage[]
  sending?: boolean
  retryAttempt?: number
  retryMax?: number
  characterName?: string
}>()

const displayName = computed(() => props.characterName?.trim() || '角色')
</script>

<template>
  <div class="chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
    <p v-if="messages.length === 0" class="chat-messages__empty">
      还没有消息，和 {{ displayName }} 打个招呼吧~
    </p>

    <article
      v-for="message in messages"
      :key="message.id"
      class="chat-messages__item"
      :class="{
        'chat-messages__item--user': message.role === 'user',
        'chat-messages__item--assistant': message.role === 'assistant'
      }"
    >
      <p class="chat-messages__role">{{ message.role === 'user' ? '你' : displayName }}</p>
      <p class="chat-messages__content">
        <template v-if="message.content">{{ message.content }}</template>
        <span v-else-if="message.status === 'streaming'" class="chat-messages__typing">正在输入…</span>
      </p>
    </article>

    <p v-if="retryAttempt && retryAttempt > 0" class="chat-messages__hint chat-messages__hint--retry">
      <span class="chat-messages__spinner" aria-hidden="true" />
      正在重新请求 {{ retryAttempt }}/{{ retryMax ?? 3 }}…
    </p>
    <p v-else-if="sending" class="chat-messages__hint">等待 {{ displayName }} 回复中…</p>
  </div>
</template>

<style scoped>
.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  max-height: none;
  padding: 8px 4px 12px;
  overflow-y: auto;
}

.chat-messages__empty,
.chat-messages__hint {
  margin: 8px auto;
  max-width: 22rem;
  padding: 10px 14px;
  border-radius: var(--home-radius-pill, 999px);
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-primary, #9f1239);
  font-size: 0.875rem;
  font-weight: 600;
  text-align: center;
  line-height: 1.55;
}

.chat-messages__hint--retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  align-self: center;
}

.chat-messages__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--home-color-chip, #fde8f0);
  border-top-color: var(--home-color-accent, #db2777);
  border-radius: 50%;
  animation: chat-messages-spin 0.7s linear infinite;
}

@keyframes chat-messages-spin {
  to {
    transform: rotate(360deg);
  }
}

.chat-messages__item {
  position: relative;
  max-width: 86%;
  padding: 12px 16px;
  border-radius: var(--home-radius-control, 16px);
  line-height: 1.55;
}

.chat-messages__item--user {
  align-self: flex-end;
  background: var(--home-color-accent, #db2777);
  color: var(--home-color-on-accent, #fff);
  border-bottom-right-radius: 6px;
  box-shadow: 0 8px 18px rgba(219, 39, 119, 0.22);
}

.chat-messages__item--assistant {
  align-self: flex-start;
  background: var(--home-color-panel, #fff);
  border: 1.5px solid var(--home-accent-soft, rgba(219, 39, 119, 0.16));
  box-shadow:
    5px 0 0 var(--home-color-accent, #db2777) inset,
    0 8px 18px rgba(63, 42, 51, 0.08);
  color: var(--home-color-text, #3f2a33);
  border-bottom-left-radius: 6px;
}

.chat-messages__role {
  margin: 0 0 4px;
  font-size: var(--home-font-meta, 0.8125rem);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.chat-messages__item--user .chat-messages__role {
  opacity: 0.85;
}

.chat-messages__content {
  margin: 0;
  font-size: var(--home-font-body, 1rem);
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-messages__typing {
  color: var(--home-color-primary, #9f1239);
  font-style: italic;
}
</style>
