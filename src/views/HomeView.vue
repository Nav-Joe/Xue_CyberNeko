<script setup lang="ts">
import Live2DView from '../components/Live2DView.vue'
import VolumeControl from '../components/VolumeControl.vue'
</script>

<template>
  <main class="home">
    <section class="stage" aria-label="Live2D 展示区">
      <Live2DView mode="home" />
    </section>

    <aside class="panel">
      <p class="badge">猫娘的家</p>
      <h1>欢迎回家~</h1>
      <p class="subtitle">
        点击雪澜会随机说一句话并朗读。语料在 <code>src/data/corpus.json</code>，可先改 body 条目。
      </p>
      <ul class="todo">
        <li>里程碑 2：部位语料 + Bert-VITS2 TTS</li>
        <li>里程碑 3：文字聊天</li>
        <li>里程碑 5：语音聊天</li>
      </ul>
      <VolumeControl />
      <p class="tip">需先运行「启动TTS.bat」。关闭此窗口后，她会回到桌面。</p>
    </aside>
  </main>
</template>
<style scoped>
.home {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  min-width: 0;
  background: linear-gradient(160deg, #fdf2f8 0%, #eff6ff 55%, #ecfeff 100%);
}

/* Live2D 主舞台：至少占窗口宽度的 65% */
.stage {
  flex: 1 1 65%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px 20px 24px;
}

.panel {
  flex: 0 0 clamp(260px, 32vw, 320px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 24px 24px 24px 0;
  padding: 28px 24px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.08);
}

.badge {
  display: inline-block;
  margin: 0 0 10px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #fce7f3;
  color: #be185d;
  font-size: 12px;
  font-weight: 700;
}

h1 {
  margin: 0 0 8px;
  font-size: 26px;
  color: #111827;
  line-height: 1.3;
}

.subtitle {
  margin: 0 0 18px;
  color: #6b7280;
  line-height: 1.65;
  font-size: 14px;
}

.subtitle code {
  font-size: 12px;
  color: #be185d;
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

@media (max-width: 720px) {
  .home {
    flex-direction: column;
  }

  .stage {
    flex: 1 1 62%;
    padding: 16px;
  }

  .panel {
    flex: 0 0 auto;
    margin: 0 16px 16px;
  }
}
</style>
