<script setup lang="ts">

import { computed, nextTick, onMounted, ref, watch } from 'vue'



import Live2DView from '../components/Live2DView.vue'

import ChatBootstrapOverlay from '../components/chat/ChatBootstrapOverlay.vue'
import { useChatLlamaBootstrap } from '../composables/chat/useChatLlamaBootstrap'
import { useChatSession } from '../composables/chat/useChatSession'

import ChatComposer from '../components/chat/ChatComposer.vue'

import ChatMessageList from '../components/chat/ChatMessageList.vue'

import ChatSettingsView from '../components/chat/ChatSettingsView.vue'



import '../components/chat/chat-panel-theme.css'



const {

  messages,

  sending,

  replyPending,

  retryAttempt,

  retryMax,

  error,

  activeCard,

  initializing,

  modeLabel,

  historyWindowHint,

  initSession,

  clearSession,

  sendUserMessage

} = useChatSession()

const llamaBootstrap = useChatLlamaBootstrap()



const characterName = computed(() => activeCard.value?.name?.trim() || '角色')



const composerBusy = computed(() => sending.value || initializing.value)



const messagesEndRef = ref<HTMLElement | null>(null)

const showSettings = ref(false)



onMounted(async () => {

  await initSession()

})



watch(

  () => messages.value.length,

  async () => {

    await nextTick()

    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })

  }

)



async function onSendMessage(text: string): Promise<void> {

  await sendUserMessage(text)

}



function closeWindow(): void {

  void window.electronAPI?.closeChatWindow?.()

}



async function openSettings(): Promise<void> {

  showSettings.value = true

}



async function closeSettings(): Promise<void> {

  showSettings.value = false

  await initSession()

}



async function onSettingsChanged(): Promise<void> {

  await initSession()

}

</script>



<template>

  <div class="chat-window">

    <ChatBootstrapOverlay
      v-if="llamaBootstrap.chatBooting.value"
      :title="llamaBootstrap.bootTitle.value"
      :message="llamaBootstrap.bootMessage.value"
      :progress="llamaBootstrap.bootProgress.value"
    />

    <ChatSettingsView

      v-if="showSettings"

      :ensure-local-llama-ready="llamaBootstrap.ensureLocalLlamaReady"

      @back="closeSettings"

      @changed="onSettingsChanged"

    />



    <div v-else class="chat-window__content">

      <aside class="chat-window__stage" aria-label="Live2D 角色展示">

        <Live2DView mode="chat" class="chat-window__live2d" :interaction-locked="replyPending" />

      </aside>



      <section class="chat-window__panel">

        <header class="chat-window__header">

          <div class="chat-window__title-block">

            <p class="chat-window__badge">文字聊天</p>

            <h1>{{ characterName }}</h1>

            <p v-if="modeLabel" class="chat-window__subtitle">{{ modeLabel }}</p>

          </div>

          <div class="chat-window__header-actions">

            <button

              type="button"

              class="chat-window__icon-btn chat-window__icon-btn--gear"

              aria-label="聊天设置"

              title="聊天设置"

              @click="openSettings"

            >

              ⚙

            </button>

            <button

              type="button"

              class="chat-window__icon-btn chat-window__icon-btn--close"

              aria-label="关闭"

              @click="closeWindow"

            >

              ×

            </button>

          </div>

        </header>



        <main class="chat-window__main">

          <p v-if="initializing" class="chat-window__status">加载会话…</p>

          <ChatMessageList

            v-else

            class="chat-window__messages"

            :messages="messages"

            :sending="sending"

            :retry-attempt="retryAttempt"

            :retry-max="retryMax"

            :character-name="characterName"

          />

          <div ref="messagesEndRef" />

        </main>



        <footer class="chat-window__footer">

          <p v-if="error" class="chat-window__error">{{ error }}</p>

          <div class="chat-window__toolbar">

            <p v-if="historyWindowHint" class="chat-window__context-hint" :title="historyWindowHint">
              {{ historyWindowHint }}
            </p>

            <button

              type="button"

              class="chat-window__ghost-btn"

              :disabled="sending || messages.length === 0"

              @click="clearSession()"

            >

              清空会话

            </button>

          </div>

          <ChatComposer :disabled="composerBusy" :sending="sending" @submit="onSendMessage" />

        </footer>

      </section>

    </div>

  </div>

</template>



<style scoped>

.chat-window {

  display: flex;

  width: 100%;

  height: 100%;

  min-height: 0;

  background: linear-gradient(165deg, #fff 0%, #fdf2f8 48%, #eff6ff 100%);

}



.chat-window__content {

  flex: 1;

  min-width: 0;

  display: grid;

  grid-template-columns: 280px minmax(0, 1fr);

  min-height: 0;

}



.chat-window__stage {

  display: flex;

  flex-direction: column;

  justify-content: center;

  align-items: center;

  min-height: 0;

  padding: 8px 4px;

  overflow: hidden;

  background: rgba(255, 255, 255, 0.42);

  border-right: 1px solid #fce7f3;

}



.chat-window__live2d {

  width: 100%;

  height: 100%;

  min-height: 0;

}



.chat-window__panel {

  display: grid;

  grid-template-rows: auto minmax(0, 1fr) auto;

  min-height: 0;

  min-width: 0;

}



.chat-window__header {

  display: flex;

  align-items: flex-start;

  justify-content: space-between;

  gap: 16px;

  padding: 16px 20px 12px;

  border-bottom: 1px solid #fce7f3;

  background: rgba(255, 255, 255, 0.92);

}



.chat-window__title-block h1 {

  margin: 0;

  font-size: 22px;

  color: #111827;

}



.chat-window__badge {

  display: inline-block;

  margin: 0 0 8px;

  padding: 4px 12px;

  border-radius: 999px;

  background: #fce7f3;

  color: #be185d;

  font-size: 11px;

  font-weight: 700;

}



.chat-window__subtitle {

  margin: 6px 0 0;

  color: #6b7280;

  font-size: 12px;

}



.chat-window__header-actions {

  display: flex;

  gap: 8px;

}



.chat-window__icon-btn {

  padding: 8px 12px;

  border: 1px solid #fbcfe8;

  border-radius: 999px;

  background: #fff;

  color: #be185d;

  font-size: 12px;

  font-weight: 600;

  cursor: pointer;

}



.chat-window__icon-btn--gear {

  width: 36px;

  padding: 0;

  font-size: 18px;

  line-height: 34px;

}



.chat-window__icon-btn--close {

  width: 36px;

  padding: 0;

  font-size: 22px;

  line-height: 34px;

}



.chat-window__main {

  min-height: 0;

  overflow: hidden;

  display: flex;

  flex-direction: column;

  padding: 14px 20px 8px;

}



.chat-window__messages {

  flex: 1;

  min-height: 0;

}



.chat-window__footer {

  padding: 10px 20px 16px;

  border-top: 1px solid #fce7f3;

  background: rgba(255, 255, 255, 0.94);

}



.chat-window__toolbar {

  display: flex;

  align-items: center;

  justify-content: space-between;

  gap: 12px;

  margin-bottom: 8px;

}



.chat-window__context-hint {

  margin: 0;

  flex: 1;

  min-width: 0;

  font-size: 11px;

  line-height: 1.45;

  color: #9ca3af;

}



.chat-window__ghost-btn {

  padding: 6px 12px;

  border: none;

  border-radius: 999px;

  background: #fce7f3;

  color: #be185d;

  font-size: 12px;

  cursor: pointer;

}



.chat-window__ghost-btn:disabled {

  opacity: 0.5;

  cursor: not-allowed;

}



.chat-window__status,

.chat-window__error {

  margin: 0 0 8px;

  font-size: 12px;

  line-height: 1.5;

}



.chat-window__status {

  color: #6b7280;

}



.chat-window__error {

  color: #b91c1c;

}



@media (max-width: 820px) {

  .chat-window__content {

    grid-template-columns: 240px minmax(0, 1fr);

  }

}

</style>


