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
  gap: 10px;
  flex: 1;
  min-height: 0;
  max-height: none;
  padding: 4px 2px;
  overflow-y: auto;
}

.chat-messages__empty,
.chat-messages__hint {
  margin: 0;
  color: #9ca3af;
  font-size: 12px;
  text-align: center;
  line-height: 1.5;
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
  border: 2px solid #fbcfe8;
  border-top-color: #db2777;
  border-radius: 50%;
  animation: chat-messages-spin 0.7s linear infinite;
}

@keyframes chat-messages-spin {
  to {
    transform: rotate(360deg);
  }
}

.chat-messages__item {
  max-width: 92%;
  padding: 10px 12px;
  border-radius: 14px;
  line-height: 1.55;
}

.chat-messages__item--user {
  align-self: flex-end;
  background: linear-gradient(135deg, #f472b6, #be185d);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-messages__item--assistant {
  align-self: flex-start;
  background: #fdf2f8;
  border: 1px solid #fbcfe8;
  color: #374151;
  border-bottom-left-radius: 4px;
}

.chat-messages__role {
  margin: 0 0 4px;
  font-size: 10px;
  font-weight: 700;
  opacity: 0.75;
}

.chat-messages__content {
  margin: 0;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-messages__typing {
  color: #9d174d;
  font-style: italic;
}
</style>
