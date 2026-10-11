<script setup lang="ts">
import ChatBootstrapOverlay from '../components/chat/ChatBootstrapOverlay.vue'
import Live2DView from '../components/Live2DView.vue'
import VolumeControl from '../components/VolumeControl.vue'
import HomeVoiceStudio from '../components/home/HomeVoiceStudio.vue'
import MemorySpacePanel from '../components/memory/MemorySpacePanel.vue'
import RelationshipPanel from '../components/relationship/RelationshipPanel.vue'
import PetTouchStatusCard from '../components/petTouch/PetTouchStatusCard.vue'
import HomeAppearanceToggle from '../components/home/HomeAppearanceToggle.vue'
import { useChatEntry } from '../composables/chat/useChatEntry'
import { useHomeAppearance } from '../composables/useHomeAppearance'
import '../styles/neko-tokens.css'
import './home-appearance.css'

const { chatBooting, bootTitle, bootMessage, bootProgress, canCancelDownload, cancellingDownload, cancelDownload, openChat } =
  useChatEntry()
const { appearance, isDark, toggleAppearance } = useHomeAppearance()
</script>

<template>
  <main class="home neko-ui" :data-appearance="appearance">
    <a class="skip-link" href="#home-desk">跳到小屋操作台</a>
    <HomeAppearanceToggle :dark="isDark" @toggle="toggleAppearance" />

    <ChatBootstrapOverlay
      v-if="chatBooting"
      :title="bootTitle"
      :message="bootMessage"
      :progress="bootProgress"
      :show-cancel="canCancelDownload"
      :cancelling="cancellingDownload"
      @cancel="cancelDownload"
    />

    <section class="stage" aria-label="她的房间">
      <div class="stage-bg" aria-hidden="true" />
      <div class="stage-frame">
        <Live2DView mode="home" />
      </div>
    </section>

    <aside id="home-desk" class="desk" tabindex="-1">
      <header class="desk-head">
        <p class="badge">雪澜的小屋</p>
        <h1>欢迎回家</h1>
      </header>

      <button
        type="button"
        class="chat-entry"
        :disabled="chatBooting"
        @click="openChat({ origin: 'home' })"
      >
        {{ chatBooting ? '准备中…' : '去跟她聊天' }}
      </button>

      <nav class="desk-nav" aria-label="小屋入口">
        <MemorySpacePanel />
        <RelationshipPanel />
      </nav>

      <div class="desk-scroll">
        <HomeVoiceStudio />
        <PetTouchStatusCard />
      </div>

      <footer class="desk-foot">
        <VolumeControl />
        <p class="tip">用「启动.bat」运行。关掉窗口，她会回到桌面。</p>
        <p class="version-tag">版本：V0.7.1（早期开发版本）</p>
      </footer>
    </aside>
  </main>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.stage {
  position: relative;
  flex: 1 1 52%;
  min-width: 0;
  min-height: 0;
  display: flex;
  padding: var(--home-space-2);
}

.stage :deep(.live2d-view) {
  position: relative;
  z-index: 1;
  border-radius: 0;
  box-shadow: none;
}

.stage-bg {
  position: absolute;
  inset: 0;
  background-image: url('../assets/home/stage-bg.png');
  background-size: cover;
  background-position: center;
  filter: blur(1px);
  pointer-events: none;
}

.stage-frame {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--home-radius-card);
  box-shadow: var(--home-shadow), inset 0 0 0 2px rgba(255, 255, 255, 0.55);
  animation: home-rise 280ms var(--home-ease) both;
}

.desk {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin: 0 var(--home-space-2) var(--home-space-2);
  padding: var(--home-space-2);
  border-radius: var(--home-radius-card);
  background: var(--home-color-surface);
  border: 1px solid var(--home-line);
  box-shadow: var(--home-shadow);
  animation: home-rise 320ms var(--home-ease) 80ms both;
}

.desk-head {
  flex: 0 0 auto;
  margin-bottom: var(--home-space-2);
}

.desk-nav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--home-space-1);
  margin: 0 0 var(--home-space-2);
}

.desk-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.desk-foot {
  flex: 0 0 auto;
  padding-top: var(--home-space-2);
  border-top: 1px solid var(--home-line);
}

.chat-entry {
  position: relative;
  align-self: stretch;
  min-height: 48px;
  margin: 0 0 var(--home-space-2);
  padding: var(--home-space-1) var(--home-space-2);
  overflow: hidden;
  border: none;
  border-radius: var(--home-radius-pill);
  background: var(--home-color-accent);
  color: var(--home-color-on-accent);
  font-size: var(--home-font-body);
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 16px rgba(219, 39, 119, 0.22);
  transition:
    transform var(--home-motion) var(--home-ease),
    box-shadow var(--home-motion) var(--home-ease);
}

.chat-entry::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 -40%;
  width: 40%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  transform: translateX(-120%);
}

.chat-entry:hover:not(:disabled) {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 14px 24px rgba(219, 39, 119, 0.28);
}

.chat-entry:hover:not(:disabled)::after {
  animation: home-sheen 360ms var(--home-ease);
}

.chat-entry:active:not(:disabled) {
  transform: translateY(0) scale(0.99);
}

.chat-entry:disabled {
  opacity: 0.65;
  cursor: wait;
}

.badge {
  display: inline-block;
  margin: 0 0 var(--home-space-1);
  padding: 4px 12px;
  border-radius: var(--home-radius-pill);
  background: var(--home-color-chip);
  color: var(--home-color-primary);
  font-size: var(--home-font-meta);
  font-weight: 700;
  line-height: 1.4;
}

h1 {
  margin: 0 0 var(--home-space-1);
  font-size: var(--home-font-display);
  color: var(--home-color-text);
  font-weight: var(--home-font-display-weight, 750);
  letter-spacing: var(--home-font-display-tracking, 0.01em);
  line-height: 1.2;
  text-wrap: balance;
}

.subtitle,
.tip {
  margin: 0;
  color: var(--home-color-muted);
  font-size: var(--home-font-body);
  line-height: 1.55;
  max-width: 32ch;
}

.tip {
  margin-top: var(--home-space-1);
  font-size: var(--home-font-meta);
}

.version-tag {
  margin: var(--home-space-1) 0 0;
  font-size: var(--home-font-meta);
  font-weight: 700;
  color: var(--home-color-text);
  line-height: 1.4;
}

@media (min-width: 720px) {
  .home {
    flex-direction: row;
  }

  .stage {
    flex: 1 1 64%;
    padding: var(--home-space-3) var(--home-space-1) var(--home-space-3) var(--home-space-3);
  }

  .desk {
    flex: 0 0 clamp(320px, 34vw, 400px);
    max-height: 100%;
    margin: var(--home-space-3) var(--home-space-3) var(--home-space-3) var(--home-space-2);
    padding: var(--home-space-3) var(--home-space-2) var(--home-space-2);
  }
}

@keyframes home-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes home-sheen {
  to {
    transform: translateX(380%);
  }
}
</style>
