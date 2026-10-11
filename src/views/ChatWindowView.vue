<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import Live2DView from '../components/Live2DView.vue'
import ChatBootstrapOverlay from '../components/chat/ChatBootstrapOverlay.vue'
import { useChatLlamaBootstrap } from '../composables/chat/useChatLlamaBootstrap'
import { useChatSession } from '../composables/chat/useChatSession'
import { useChatStt } from '../composables/chat/useChatStt'
import { useHomeAppearance } from '../composables/useHomeAppearance'
import { useScreenCompanionChatGate } from '../composables/useScreenCompanionChatGate'
import ChatComposer from '../components/chat/ChatComposer.vue'
import ChatMessageList from '../components/chat/ChatMessageList.vue'
import ChatSettingsView from '../components/chat/ChatSettingsView.vue'
import HomeAppearanceToggle from '../components/home/HomeAppearanceToggle.vue'

import '../styles/neko-tokens.css'
import '../components/chat/chat-panel-theme.css'
import '../components/chat/chat-appearance.css'

const {
  messages,
  sending,
  replyPending,
  retryAttempt,
  retryMax,
  error,
  config,
  activeCard,
  initializing,
  modeLabel,
  historyWindowHint,
  initSession,
  clearSession,
  sendUserMessage
} = useChatSession()

const { appearance, isDark, toggleAppearance } = useHomeAppearance()
const screenCompanionGate = useScreenCompanionChatGate()
const llamaBootstrap = useChatLlamaBootstrap()
const composerRef = ref<{ appendDraft: (text: string) => void } | null>(null)
const characterName = computed(() => activeCard.value?.name?.trim() || '角色')
const composerBusy = computed(() => sending.value || initializing.value)
const sessionChatLocked = computed(() => screenCompanionGate.sessionActive.value)

/** 开对话 TTS 时：sending 会等到播完；关 TTS 则仅覆盖 LLM 回合 */
const ttsPlaybackGate = computed(
  () => config.value?.ttsEnabled !== false && sending.value
)

const composerGateHint = computed(() => {
  if (sessionChatLocked.value) return '猫娘正在看你打游戏，暂时不能聊天'
  if (ttsPlaybackGate.value) return '朗读中，请稍候再输入或语音'
  return ''
})

const sttEnabled = computed(() => config.value?.sttEnabled === true)

const chatStt = useChatStt({
  isEnabled: () => config.value?.sttEnabled === true,
  isAutoSend: () => config.value?.sttAutoSend === true,
  getBaseUrl: () => config.value?.sttBaseUrl ?? '',
  getDeviceId: () => config.value?.sttDeviceId ?? '',
  isBlocked: () => composerBusy.value || sessionChatLocked.value,
  appendDraft: (text) => composerRef.value?.appendDraft(text),
  sendText: (text) => onSendMessage(text),
  setError: (message) => {
    error.value = message
  }
})

const {
  phase: sttPhase,
  statusHint: sttStatusHint,
  preparing: sttPreparing,
  level: sttLevel,
  startRecording: startSttRecording,
  finishRecording: finishSttRecording
} = chatStt

const messagesEndRef = ref<HTMLElement | null>(null)
const showSettings = ref(false)

onMounted(async () => {
  await initSession()
})

watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    messagesEndRef.value?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' })
  }
)

async function onSendMessage(text: string): Promise<void> {
  await screenCompanionGate.guardSend(() => sendUserMessage(text))
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
  <div class="chat-window neko-ui" :data-appearance="appearance">
    <a class="skip-link" href="#chat-panel">跳到对话</a>
    <HomeAppearanceToggle :dark="isDark" @toggle="toggleAppearance" />
    <ChatBootstrapOverlay
      v-if="llamaBootstrap.chatBooting.value"
      :title="llamaBootstrap.bootTitle.value"
      :message="llamaBootstrap.bootMessage.value"
      :progress="llamaBootstrap.bootProgress.value"
      :show-cancel="llamaBootstrap.canCancelDownload.value"
      :cancelling="llamaBootstrap.cancellingDownload.value"
      @cancel="llamaBootstrap.cancelDownload"
    />

    <ChatSettingsView
      v-if="showSettings"
      :ensure-local-llama-ready="llamaBootstrap.ensureLocalLlamaReady"
      @back="closeSettings"
      @changed="onSettingsChanged"
    />

    <div v-else class="chat-window__content">
      <aside class="chat-window__stage" aria-label="Live2D 角色展示">
        <div class="chat-window__frame">
          <Live2DView mode="chat" class="chat-window__live2d" :interaction-locked="replyPending" />
        </div>
      </aside>

      <section id="chat-panel" class="chat-window__panel" tabindex="-1">
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
          <ChatComposer
            ref="composerRef"
            :disabled="composerBusy || sessionChatLocked"
            :sending="sending"
            :gate-hint="composerGateHint"
            :stt-enabled="sttEnabled"
            :stt-phase="sttPhase"
            :stt-status-hint="sttStatusHint"
            :stt-preparing="sttPreparing"
            :stt-level="sttLevel"
            @submit="onSendMessage"
            @stt-start="startSttRecording"
            @stt-finish="finishSttRecording"
          />
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
}

.chat-window__content {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(200px, 34%) minmax(0, 1fr);
  min-height: 0;
  gap: var(--home-space-3);
  padding: var(--home-space-3);
}

.chat-window__stage {
  display: flex;
  min-height: 0;
  padding: 6px;
  overflow: hidden;
}

.chat-window__frame {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--home-radius-card);
  background: var(--home-color-inset);
  box-shadow:
    inset 0 0 0 2px var(--home-accent-soft),
    var(--home-shadow);
}

.chat-window__live2d {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.chat-window__live2d :deep(.live2d-view--chat) {
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.chat-window__panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
  min-width: 0;
  border-radius: var(--home-radius-card);
  background: var(--home-color-panel);
  border: 1px solid var(--home-accent-soft);
  box-shadow: var(--home-shadow);
  overflow: hidden;
}

.chat-window__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--home-space-2);
  padding: var(--home-space-2) 56px var(--home-space-2) var(--home-space-3);
  border-bottom: 1px solid var(--home-line);
  background: var(--home-color-surface);
}

.chat-window__title-block h1 {
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.5rem);
  font-weight: var(--home-font-display-weight, 750);
  letter-spacing: var(--home-font-display-tracking, 0.01em);
  line-height: 1.25;
  color: var(--home-color-text);
  text-wrap: balance;
}

.chat-window__badge {
  display: inline-block;
  margin: 0 0 6px;
  padding: 3px 12px;
  border-radius: var(--home-radius-pill);
  background: var(--home-color-chip);
  color: var(--home-color-primary);
  font-size: var(--home-font-meta);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.chat-window__subtitle {
  margin: 6px 0 0;
  color: var(--home-color-muted);
  font-size: var(--home-font-meta);
  line-height: 1.5;
}

.chat-window__header-actions {
  display: flex;
  gap: var(--home-space-1);
}

.chat-window__icon-btn {
  width: var(--home-target);
  height: var(--home-target);
  padding: 0;
  border: 1.5px solid var(--home-color-primary);
  border-radius: var(--home-radius-pill);
  background: var(--home-color-chip);
  color: var(--home-color-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.chat-window__icon-btn:hover {
  background: var(--home-color-accent);
  color: var(--home-color-on-accent);
  border-color: var(--home-color-accent);
}

.chat-window__main {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: var(--home-space-2) var(--home-space-3) var(--home-space-1);
}

.chat-window__messages {
  flex: 1;
  min-height: 0;
}

.chat-window__footer {
  padding: var(--home-space-2) var(--home-space-3) var(--home-space-3);
  border-top: 1px solid var(--home-line);
  background: var(--home-color-surface);
}

.chat-window__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--home-space-2);
  margin-bottom: var(--home-space-1);
}

.chat-window__context-hint {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: var(--home-font-meta);
  line-height: 1.45;
  color: var(--home-color-muted);
}

.chat-window__ghost-btn {
  min-height: var(--home-target-sm);
  padding: 6px 14px;
  border: 1.5px solid var(--home-color-primary);
  border-radius: var(--home-radius-pill);
  background: var(--home-color-panel);
  color: var(--home-color-primary);
  font-size: var(--home-font-meta);
  font-weight: 700;
  cursor: pointer;
}

.chat-window__ghost-btn:hover:not(:disabled) {
  color: var(--home-color-on-accent);
  border-color: var(--home-color-accent);
  background: var(--home-color-accent);
}

.chat-window__ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-window__status,
.chat-window__error {
  margin: 0 0 8px;
  font-size: 0.875rem;
  line-height: 1.5;
}

.chat-window__status {
  color: var(--home-color-muted);
}

.chat-window__error {
  color: var(--home-color-danger);
}

@media (max-width: 820px) {
  .chat-window__content {
    grid-template-columns: minmax(180px, 32%) minmax(0, 1fr);
    padding: var(--home-space-1);
    gap: var(--home-space-1);
  }
}
</style>
