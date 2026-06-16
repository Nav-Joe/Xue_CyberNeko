<template>
  <main class="home">
    <section class="hero">
      <p class="badge">猫娘的家</p>
      <h1>欢迎回家~</h1>
      <p class="subtitle">这里是雪澜的「家」，以后会放聊天、设置和房间背景。</p>
      <ul class="todo">
        <li>里程碑 3：文字聊天</li>
        <li>里程碑 5：语音聊天</li>
        <li>里程碑 7：设置与房间背景</li>
      </ul>
      <p class="tip">关闭此窗口后，桌面的猫娘会继续陪着你。</p>
    </section>
  </main>
</template>

<style scoped>
.home {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 24px;
  background: linear-gradient(160deg, #fdf2f8 0%, #eff6ff 55%, #ecfeff 100%);
}

.hero {
  width: min(520px, 100%);
  padding: 32px 36px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.1);
  text-align: center;
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
}

h1 {
  margin: 0 0 8px;
  font-size: 32px;
  color: #111827;
}

.subtitle {
  margin: 0 0 20px;
  color: #6b7280;
  line-height: 1.6;
}

.todo {
  margin: 0 0 16px;
  padding-left: 1.2em;
  text-align: left;
  color: #4b5563;
  line-height: 1.8;
}

.tip {
  margin: 0;
  font-size: 13px;
  color: #9ca3af;
}
</style>
