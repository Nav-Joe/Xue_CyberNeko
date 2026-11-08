<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import HomeAppearanceToggle from './home/HomeAppearanceToggle.vue'
import { useHomeAppearance } from '../composables/useHomeAppearance'
import type { RuntimeComponentId, RuntimeComponentStatus } from '../services/runtimeEnv/types'
import '../styles/neko-tokens.css'

const { appearance, isDark, toggleAppearance } = useHomeAppearance()

const items = ref<RuntimeComponentStatus[]>([])
const page = ref<'installed' | 'missing' | 'plugins'>('installed')
const busyId = ref<RuntimeComponentId | null>(null)
const logLines = ref<string[]>([])
const error = ref('')
const licenseAccepted = ref(false)

const visible = computed(() => {
  if (page.value === 'plugins') return []
  return items.value.filter((item) => (page.value === 'installed' ? item.installed : !item.installed))
})
const installedCount = computed(() => items.value.filter((item) => item.installed).length)
const missingCount = computed(() => items.value.length - installedCount.value)

let unbindLog: (() => void) | null = null

async function refresh(): Promise<void> {
  if (!window.electronAPI?.listRuntimeEnv) {
    error.value = '当前环境不支持组件管理。'
    return
  }
  items.value = await window.electronAPI.listRuntimeEnv()
}

async function run(
  id: RuntimeComponentId,
  action: 'install' | 'uninstall',
  acceptLicense = false
): Promise<void> {
  if (busyId.value) return
  error.value = ''
  logLines.value = []
  busyId.value = id
  try {
    const result =
      action === 'install'
        ? await window.electronAPI.installRuntimeEnv(id, acceptLicense)
        : await window.electronAPI.uninstallRuntimeEnv(id)
    if (!result.ok) error.value = result.detail
  } catch (err) {
    error.value = err instanceof Error ? err.message : '操作失败'
  } finally {
    busyId.value = null
    await refresh()
  }
}

function install(item: RuntimeComponentStatus): void {
  if (item.license && !licenseAccepted.value) {
    error.value = '下载官方样板前，请先勾选同意 Live2D 素材许可。'
    return
  }
  void run(item.id, 'install', item.license ? licenseAccepted.value : false)
}

onMounted(() => {
  unbindLog =
    window.electronAPI?.onRuntimeEnvLog?.((payload) => {
      logLines.value = [...logLines.value, payload.line].slice(-80)
    }) ?? null
  void refresh()
})

onBeforeUnmount(() => {
  unbindLog?.()
})
</script>

<template>
  <main class="env neko-ui" :data-appearance="appearance">
    <HomeAppearanceToggle :dark="isDark" @toggle="toggleAppearance" />

    <header class="env-head">
      <p class="env-badge">官方环境</p>
      <h1>环境</h1>
    </header>

    <div class="env-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="env-tab"
        :class="{ 'env-tab--on': page === 'installed' }"
        :aria-selected="page === 'installed'"
        @click="page = 'installed'"
      >
        已安装
        <span>{{ installedCount }}</span>
      </button>
      <button
        type="button"
        role="tab"
        class="env-tab"
        :class="{ 'env-tab--on': page === 'missing' }"
        :aria-selected="page === 'missing'"
        @click="page = 'missing'"
      >
        未安装
        <span>{{ missingCount }}</span>
      </button>
      <button
        type="button"
        role="tab"
        class="env-tab"
        :class="{ 'env-tab--on': page === 'plugins' }"
        :aria-selected="page === 'plugins'"
        @click="page = 'plugins'"
      >
        插件
      </button>
    </div>

    <p v-if="page === 'plugins'" class="env-plugins">🚧施工中...敬请期待🚧</p>

    <p v-if="error && page !== 'plugins'" class="env-error">{{ error }}</p>

    <div v-if="page !== 'plugins'" class="env-body">
      <p v-if="visible.length === 0" class="env-empty">
        {{ page === 'installed' ? '还没有已安装的官方组件。' : '官方组件都已装好。' }}
      </p>

      <article v-for="item in visible" :key="item.id" class="env-card">
        <header class="env-card__head">
          <h2>{{ item.title }}</h2>
          <span class="env-pill">{{ item.required ? '必要' : '非必要' }}</span>
        </header>
        <span v-if="item.sizeLabel" class="env-size">{{ item.sizeLabel }}</span>
        <p class="env-summary">{{ item.summary }}</p>

        <div v-if="item.license && !item.installed" class="env-license">
          <p class="env-license__title">{{ item.license.title }}</p>
          <ul>
            <li v-for="line in item.license.lines" :key="line">{{ line }}</li>
          </ul>
          <button type="button" class="env-link" @click="window.electronAPI.openRuntimeEnvLicense()">
            查看官方许可
          </button>
          <label class="env-check">
            <input v-model="licenseAccepted" type="checkbox" :disabled="busyId !== null" />
            我已阅读并同意上述许可，再下载官方样板
          </label>
        </div>

        <p v-if="item.uninstallBlockedReason && item.installed && !item.canUninstall" class="env-note">
          {{ item.uninstallBlockedReason }}
        </p>

        <div class="env-actions">
          <button
            v-if="item.canInstall"
            type="button"
            class="env-btn env-btn--primary"
            :disabled="busyId !== null"
            @click="install(item)"
          >
            {{ busyId === item.id ? '请稍候…' : '安装' }}
          </button>
          <button
            v-if="item.canUninstall"
            type="button"
            class="env-btn"
            :disabled="busyId !== null"
            @click="run(item.id, 'uninstall')"
          >
            卸载
          </button>
        </div>
      </article>
    </div>

    <pre v-if="logLines.length && page !== 'plugins'" class="env-log">{{ logLines.join('\n') }}</pre>
  </main>
</template>

<style scoped>
.env {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 28px 32px 24px;
  background: var(--home-color-canvas, #fff7fb);
  color: var(--home-color-text, #3f2a33);
}

.env-head {
  max-width: 720px;
  margin-bottom: 18px;
}

.env-badge {
  display: inline-block;
  margin: 0 0 8px;
  padding: 2px 10px;
  border-radius: var(--home-radius-pill, 999px);
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-primary, #9f1239);
  font-size: 0.8125rem;
  font-weight: 700;
}

.env-head h1 {
  margin: 0 0 8px;
  font-size: 1.5rem;
}

.env-summary,
.env-note,
.env-empty {
  margin: 0;
  color: var(--home-color-muted, #5c4150);
  font-size: 0.9375rem;
  line-height: 1.55;
}

.env-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.env-tab {
  min-height: 44px;
  padding: 8px 16px;
  border-radius: var(--home-radius-pill, 999px);
  border: 1.5px solid var(--home-line, rgba(63, 42, 51, 0.12));
  background: transparent;
  color: var(--home-color-text, #3f2a33);
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
}

.env-tab span {
  margin-left: 6px;
  color: var(--home-color-muted, #5c4150);
}

.env-tab--on {
  border-color: var(--home-color-primary, #9f1239);
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-primary, #9f1239);
}

.env-error {
  margin: 0 0 12px;
  color: var(--home-color-warning, #9a3412);
}

.env-plugins {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: var(--home-color-text, #3f2a33);
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
}

.env-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.env-card {
  position: relative;
  padding: 16px 16px 16px;
  border: 1px solid var(--home-accent-soft, rgba(219, 39, 119, 0.16));
  border-radius: var(--home-radius-card, 20px);
  background: var(--home-color-panel, #fff);
}

.env-size {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 8px;
  border: 1px solid var(--home-line, rgba(63, 42, 51, 0.28));
  border-radius: var(--home-radius-pill, 999px);
  color: var(--home-color-text, #3f2a33);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.4;
}

.env-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-right: 72px;
}

.env-card__head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.env-pill {
  padding: 2px 8px;
  border-radius: var(--home-radius-pill, 999px);
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-primary, #9f1239);
  font-size: 0.75rem;
  font-weight: 700;
}

.env-summary,
.env-note {
  margin-top: 8px;
}

.env-license {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--home-color-canvas, #fff7fb);
}

.env-license__title {
  margin: 0 0 6px;
  font-weight: 700;
}

.env-license ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.8125rem;
  line-height: 1.45;
}

.env-link,
.env-btn {
  min-height: 40px;
  margin-top: 10px;
  padding: 8px 14px;
  border-radius: var(--home-radius-pill, 999px);
  border: 1.5px solid var(--home-color-primary, #9f1239);
  background: transparent;
  color: var(--home-color-primary, #9f1239);
  font-weight: 700;
  cursor: pointer;
}

.env-btn--primary {
  background: var(--home-color-accent, #db2777);
  border-color: var(--home-color-accent, #db2777);
  color: var(--home-color-on-accent, #fff);
}

.env-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.env-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 8px;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.env-actions {
  display: flex;
  gap: 8px;
}

.env-log {
  margin: 16px 0 0;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.45;
}
</style>
