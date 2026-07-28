<script setup lang="ts">

import ChatBootstrapOverlay from '../components/chat/ChatBootstrapOverlay.vue'

import Live2DView from '../components/Live2DView.vue'

import VolumeControl from '../components/VolumeControl.vue'

import VoiceSampleSwitcher from '../components/VoiceSampleSwitcher.vue'

import MemorySpacePanel from '../components/memory/MemorySpacePanel.vue'

import { useChatEntry } from '../composables/chat/useChatEntry'



const { chatBooting, bootTitle, bootMessage, bootProgress, canCancelDownload, cancellingDownload, cancelDownload, openChat } = useChatEntry()

</script>



<template>

  <main class="home">

    <ChatBootstrapOverlay

      v-if="chatBooting"

      :title="bootTitle"

      :message="bootMessage"

      :progress="bootProgress"

      :show-cancel="canCancelDownload"

      :cancelling="cancellingDownload"

      @cancel="cancelDownload"

    />



    <section class="stage" aria-label="Live2D 展示区">

      <Live2DView mode="home" />

    </section>



    <aside class="panel">

      <p class="badge">猫娘的家</p>

      <h1>欢迎回家~</h1>

      <p class="subtitle">官方默认可选用精选触摸音频或自定义语料；自定义声线会预热语料。切换时桌宠会暂时隐藏。</p>



      <VoiceSampleSwitcher />



      <button type="button" class="chat-entry" :disabled="chatBooting" @click="openChat({ origin: 'home' })">

        {{ chatBooting ? '准备中…' : '文字聊天' }}

      </button>

      <MemorySpacePanel />

      <ul class="todo">

        <li>里程碑 5：语音聊天</li>

      </ul>



      <VolumeControl />

      <p class="tip">请用「启动.bat」运行桌宠（会自动启动 TTS）。关闭此窗口后，她会回到桌面。</p>

    </aside>

    <p class="version-tag">版本：V0.4.0b（早期开发版本）</p>

  </main>

</template>



<style scoped>

.home {

  display: flex;

  flex-direction: row;

  width: 100%;

  height: 100%;

  min-width: 0;

  min-height: 0;

  overflow: hidden;

  background: linear-gradient(160deg, #fdf2f8 0%, #eff6ff 55%, #ecfeff 100%);

}



.stage {

  flex: 1 1 65%;

  min-width: 0;

  min-height: 0;

  display: flex;

  align-items: center;

  justify-content: center;

  padding: 16px 16px 16px 24px;

}



.panel {

  flex: 0 0 clamp(280px, 34vw, 360px);

  align-self: stretch;

  display: flex;

  flex-direction: column;

  justify-content: flex-start;

  min-height: 0;

  max-height: 100%;

  margin: 16px 20px 16px 0;

  padding: 20px 22px 24px;

  border-radius: 20px;

  background: rgba(255, 255, 255, 0.92);

  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.08);

  overflow-x: hidden;

  overflow-y: auto;

  overscroll-behavior: contain;

}



.chat-entry {

  align-self: flex-start;

  margin: 0 0 14px;

  padding: 10px 16px;

  border: none;

  border-radius: 999px;

  background: linear-gradient(135deg, #f472b6, #be185d);

  color: #fff;

  font-size: 14px;

  font-weight: 700;

  cursor: pointer;

  box-shadow: 0 8px 20px rgba(190, 24, 93, 0.28);

}



.chat-entry:hover:not(:disabled) {

  filter: brightness(1.05);

}



.chat-entry:disabled {

  opacity: 0.65;

  cursor: wait;

}



.badge {

  display: inline-block;

  margin: 0 0 12px;

  padding: 4px 12px;

  border-radius: 999px;

  background: #fce7f3;

  color: #be185d;

  font-size: 12px;

  font-weight: 700;

  line-height: 1.4;

}



h1 {

  margin: 0 0 10px;

  font-size: 24px;

  color: #111827;

  line-height: 1.35;

}



.subtitle {

  margin: 0 0 14px;

  color: #6b7280;

  line-height: 1.65;

  font-size: 14px;

}



.todo {

  margin: 0 0 16px;

  padding-left: 1.2em;

  color: #4b5563;

  line-height: 1.75;

  font-size: 13px;

}



.tip {

  margin: 0;

  margin-top: auto;

  padding-top: 12px;

  font-size: 12px;

  color: #9ca3af;

  line-height: 1.5;

}



.version-tag {
  position: fixed;
  left: 14px;
  bottom: 10px;
  margin: 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
  z-index: 5;
  pointer-events: none;
  user-select: none;
}



@media (max-width: 720px) {

  .home {

    flex-direction: column;

  }



  .stage {

    flex: 1 1 62%;

    padding: 16px;

  }



  .panel {

    flex: 1 1 auto;

    max-height: none;

    margin: 0 12px 12px;

    padding: 16px 18px 20px;

  }

}

</style>

