<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  getRelationshipSnapshot,
  getRelationshipStatus,
  type RelationshipSnapshotView
} from '../../services/relationship/relationshipClient'
import RelationshipRadar from './RelationshipRadar.vue'

import '../chat/chat-panel-theme.css'

const DIMS = [
  { key: 'closeness' as const, label: '亲近' },
  { key: 'trust' as const, label: '信任' },
  { key: 'rapport' as const, label: '投契' }
]

const open = ref(false)
const loading = ref(false)
const error = ref('')
/** 记忆 + 情感插件均开才显示入口 */
const active = ref(false)
const snapshot = ref<RelationshipSnapshotView | null>(null)

const hasAnyNet = computed(() => {
  const n = snapshot.value?.netToday
  if (!n) return false
  return n.closeness !== 0 || n.trust !== 0 || n.rapport !== 0
})

async function refreshActive(): Promise<void> {
  try {
    const status = await getRelationshipStatus()
    active.value = status.active
    if (!status.active) {
      open.value = false
      snapshot.value = null
    }
  } catch {
    active.value = false
    open.value = false
  }
}

function formatScore(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const t = Math.round(n * 100) / 100
  return Number.isInteger(t) ? String(t) : String(t)
}

function formatNet(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  const t = Math.round(n * 100) / 100
  const body = Number.isInteger(t) ? String(t) : String(t)
  return t > 0 ? `+${body}` : body
}

/** 条形：0 在中线；负向左、正向右（相对半宽） */
function barStyle(score: number): { left: string; width: string; positive: boolean } {
  const v = Math.min(10, Math.max(-10, Number.isFinite(score) ? score : 0))
  const half = 50
  const widthPct = (Math.abs(v) / 10) * half
  if (v >= 0) {
    return { left: '50%', width: `${widthPct}%`, positive: true }
  }
  return { left: `${50 - widthPct}%`, width: `${widthPct}%`, positive: false }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await refreshActive()
    if (!active.value) {
      snapshot.value = null
      return
    }
    snapshot.value = await getRelationshipSnapshot()
    if (!snapshot.value) {
      error.value = '加载好感度失败'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载好感度失败'
  } finally {
    loading.value = false
  }
}

async function openPanel(): Promise<void> {
  open.value = true
  await load()
}

function closePanel(): void {
  open.value = false
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') {
    void refreshActive()
  }
}

onMounted(() => {
  void refreshActive()
  window.addEventListener('focus', refreshActive)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  window.removeEventListener('focus', refreshActive)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div v-if="active" class="rel-entry">
    <button type="button" class="rel-entry__btn" @click="openPanel">好感度</button>

    <div v-if="open" class="rel-space" role="dialog" aria-label="好感度" aria-modal="true">
      <div class="rel-space__shell">
        <header class="rel-space__header">
          <div class="rel-space__title-block">
            <p class="rel-space__badge">情感模拟 · 好感</p>
            <h1>和她的关系</h1>
          </div>
          <button type="button" class="rel-space__icon-btn" aria-label="关闭" @click="closePanel">
            ×
          </button>
        </header>

        <main class="rel-space__main">
          <p v-if="!active" class="chat-theme__hint rel-space__status">
            好感度未开启。请先在桌宠右键 → 设置中开启记忆与「官方情感模拟插件」。
          </p>
          <template v-else>
            <div class="rel-space__toolbar">
              <button
                type="button"
                class="chat-theme__btn chat-theme__btn--ghost"
                :disabled="loading"
                @click="load"
              >
                刷新
              </button>
            </div>

            <p v-if="loading" class="chat-theme__hint rel-space__status">加载中…</p>
            <p v-else-if="error" class="chat-theme__error rel-space__status">{{ error }}</p>

            <template v-else-if="snapshot">
              <RelationshipRadar
                :closeness="snapshot.scores.closeness"
                :trust="snapshot.scores.trust"
                :rapport="snapshot.scores.rapport"
              />
              <p class="chat-theme__hint rel-space__radar-hint">虚线环约为 0 分；外圈为 ±10</p>

              <section class="rel-space__bars" aria-label="三维分数">
                <div v-for="d in DIMS" :key="d.key" class="rel-bar">
                  <div class="rel-bar__head">
                    <span class="rel-bar__label">{{ d.label }}</span>
                    <span class="rel-bar__meta">
                      {{ formatScore(snapshot.scores[d.key]) }} · {{ snapshot.tags[d.key] }}
                    </span>
                  </div>
                  <div class="rel-bar__track">
                    <span class="rel-bar__mid" />
                    <span
                      class="rel-bar__fill"
                      :class="
                        barStyle(snapshot.scores[d.key]).positive
                          ? 'rel-bar__fill--pos'
                          : 'rel-bar__fill--neg'
                      "
                      :style="{
                        left: barStyle(snapshot.scores[d.key]).left,
                        width: barStyle(snapshot.scores[d.key]).width
                      }"
                    />
                  </div>
                </div>
              </section>

              <section class="rel-space__stats" aria-label="今日净变化">
                <h2 class="chat-theme__section-title">今日净变化</h2>
                <p v-if="!hasAnyNet" class="chat-theme__hint">今日无调分</p>
                <ul v-else class="rel-space__net-list">
                  <li v-for="d in DIMS" :key="d.key">
                    {{ d.label }}
                    <strong
                      :class="{
                        'rel-net--up': snapshot.netToday[d.key] > 0,
                        'rel-net--down': snapshot.netToday[d.key] < 0
                      }"
                    >
                      {{ formatNet(snapshot.netToday[d.key]) }}
                    </strong>
                  </li>
                </ul>
              </section>
            </template>
          </template>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rel-entry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.rel-entry__btn {
  align-self: flex-start;
  margin: 0 0 14px;
  padding: 10px 16px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #fb7185, #be185d);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(190, 24, 93, 0.28);
}

.rel-entry__btn:hover {
  filter: brightness(1.05);
}

.rel-space {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
  background: rgba(15, 23, 42, 0.28);
}

.rel-space__shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: linear-gradient(165deg, #fff 0%, #fdf2f8 48%, #eff6ff 100%);
}

.rel-space__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #fce7f3;
  background: rgba(255, 255, 255, 0.92);
}

.rel-space__badge {
  display: inline-block;
  margin: 0 0 8px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #fce7f3;
  color: #be185d;
  font-size: 11px;
  font-weight: 700;
}

.rel-space__title-block h1 {
  margin: 0;
  font-size: 22px;
  color: #831843;
}

.rel-space__icon-btn {
  border: none;
  background: transparent;
  font-size: 28px;
  line-height: 1;
  color: #9d174d;
  cursor: pointer;
  padding: 0 4px;
}

.rel-space__main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rel-space__toolbar {
  display: flex;
  justify-content: flex-end;
}

.rel-space__status {
  margin: 8px 0;
}

.rel-space__radar-hint {
  text-align: center;
  margin: 0;
}

.rel-space__bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid #fce7f3;
}

.rel-bar__head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.rel-bar__label {
  font-weight: 700;
  color: #9d174d;
}

.rel-bar__meta {
  color: #6b7280;
}

.rel-bar__track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: #fce7f3;
  overflow: hidden;
}

.rel-bar__mid {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #f9a8d4;
  z-index: 1;
}

.rel-bar__fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 999px;
}

.rel-bar__fill--pos {
  background: linear-gradient(90deg, #f9a8d4, #db2777);
}

.rel-bar__fill--neg {
  background: linear-gradient(90deg, #64748b, #94a3b8);
}

.rel-space__stats {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid #fce7f3;
}

.rel-space__net-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: #374151;
}

.rel-space__net-list strong {
  margin-left: 8px;
}

.rel-net--up {
  color: #be185d;
}

.rel-net--down {
  color: #475569;
}
</style>
