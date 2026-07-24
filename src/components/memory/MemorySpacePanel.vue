<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getMemoryStatus, listMemoryTimeline, recordMemoryPeek } from '../../services/memory/memoryClient'
import type { MemoryTimelineItem } from '../../services/memory/types'

import '../chat/chat-panel-theme.css'

const open = ref(false)
const loading = ref(false)
const error = ref('')
const enabled = ref(false)
const layer = ref<'all' | 'L1' | 'L2' | 'L3'>('all')
const items = ref<MemoryTimelineItem[]>([])

const weeklyPeriods = computed(() =>
  items.value.filter((item): item is Extract<MemoryTimelineItem, { kind: 'period' }> =>
    item.kind === 'period' && item.periodKind === 'weekly'
  )
)
const monthlyPeriods = computed(() =>
  items.value.filter((item): item is Extract<MemoryTimelineItem, { kind: 'period' }> =>
    item.kind === 'period' && item.periodKind === 'monthly'
  )
)
const nonPeriodItems = computed(() => items.value.filter((item) => item.kind !== 'period'))

function formatVitality(weight: number): string {
  return Number.isFinite(weight) ? weight.toFixed(2) : '—'
}

function formatDay(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const status = await getMemoryStatus()
    enabled.value = status.ready && status.memoryEnabled
    if (!enabled.value) {
      items.value = []
      return
    }
    items.value = await listMemoryTimeline({
      layer: layer.value === 'all' ? undefined : layer.value,
      limit: 60
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载记忆失败'
  } finally {
    loading.value = false
  }
}

async function openPanel(): Promise<void> {
  open.value = true
  try {
    const status = await getMemoryStatus()
    if (status.ready && status.memoryEnabled) {
      await recordMemoryPeek()
    }
  } catch {
    /* peek 失败不挡打开 */
  }
  await load()
}

function closePanel(): void {
  open.value = false
}

onMounted(async () => {
  const status = await getMemoryStatus()
  enabled.value = status.ready && status.memoryEnabled
})
</script>

<template>
  <div class="memory-entry">
    <button type="button" class="memory-entry__btn" @click="openPanel">记忆空间</button>

    <div v-if="open" class="memory-space" role="dialog" aria-label="记忆空间" aria-modal="true">
      <div class="memory-space__shell">
        <header class="memory-space__header">
          <div class="memory-space__title-block">
            <p class="memory-space__badge">记忆空间</p>
            <h1>她记得的事</h1>
          </div>
          <button
            type="button"
            class="memory-space__icon-btn"
            aria-label="关闭"
            @click="closePanel"
          >
            ×
          </button>
        </header>

        <main class="memory-space__main">
          <p v-if="!enabled" class="chat-theme__hint memory-space__status">
            记忆未开启。请在文字聊天设置中启用后再查看。
          </p>
          <template v-else>
            <div class="memory-space__toolbar">
              <label class="chat-theme__label" for="memory-layer">层级</label>
              <select
                id="memory-layer"
                v-model="layer"
                class="chat-theme__select memory-space__select"
                @change="load"
              >
                <option value="all">全部</option>
                <option value="L1">核心记忆</option>
                <option value="L2">日常总结记忆</option>
                <option value="L3">周/月总结记忆</option>
              </select>
              <button
                type="button"
                class="chat-theme__btn chat-theme__btn--ghost"
                :disabled="loading"
                @click="load"
              >
                刷新
              </button>
            </div>

            <p v-if="loading" class="chat-theme__hint memory-space__status">加载中…</p>
            <p v-else-if="error" class="chat-theme__error memory-space__status">{{ error }}</p>

            <div v-else-if="layer === 'L3'" class="memory-space__period-panels">
              <section class="memory-space__period-box">
                <h2 class="chat-theme__section-title">周总结记忆</h2>
                <div class="memory-space__feed">
                  <article
                    v-for="item in weeklyPeriods"
                    :key="item.id"
                    class="memory-space__bubble"
                  >
                    <p class="memory-space__role">
                      周 · {{ formatDay(item.periodStart) }}～{{ formatDay(item.periodEnd) }} · 分
                      {{ item.significance?.toFixed?.(1) ?? item.significance }}
                    </p>
                    <p class="memory-space__content">{{ item.summary }}</p>
                    <p v-if="item.keywords?.length" class="memory-space__meta">
                      关键词：{{ item.keywords.join('、') }}
                    </p>
                  </article>
                  <p v-if="weeklyPeriods.length === 0" class="chat-theme__hint memory-space__status">
                    暂无周总结
                  </p>
                </div>
              </section>
              <section class="memory-space__period-box">
                <h2 class="chat-theme__section-title">月总结记忆</h2>
                <div class="memory-space__feed">
                  <article
                    v-for="item in monthlyPeriods"
                    :key="item.id"
                    class="memory-space__bubble"
                  >
                    <p class="memory-space__role">
                      月 · {{ formatDay(item.periodStart) }}～{{ formatDay(item.periodEnd) }} · 分
                      {{ item.significance?.toFixed?.(1) ?? item.significance }}
                    </p>
                    <p class="memory-space__content">{{ item.summary }}</p>
                    <p v-if="item.keywords?.length" class="memory-space__meta">
                      关键词：{{ item.keywords.join('、') }}
                    </p>
                  </article>
                  <p v-if="monthlyPeriods.length === 0" class="chat-theme__hint memory-space__status">
                    暂无月总结
                  </p>
                </div>
              </section>
            </div>

            <div v-else class="memory-space__feed">
              <article
                v-for="item in nonPeriodItems"
                :key="`${item.kind}-${item.id}`"
                class="memory-space__bubble"
              >
                <template v-if="item.kind === 'summary'">
                  <p class="memory-space__role">
                    日常总结 · 分 {{ item.significance?.toFixed?.(1) ?? item.significance }}
                  </p>
                  <p class="memory-space__content">{{ item.summary }}</p>
                  <p v-if="item.keywords?.length" class="memory-space__meta">
                    关键词：{{ item.keywords.join('、') }}
                  </p>
                </template>
                <template v-else-if="item.kind === 'core'">
                  <p class="memory-space__role">
                    核心记忆 · {{ item.category }} · 活力 {{ formatVitality(item.weight) }}
                  </p>
                  <p class="memory-space__content">{{ item.content }}</p>
                </template>
              </article>

              <template v-if="layer === 'all'">
                <article
                  v-for="item in [...weeklyPeriods, ...monthlyPeriods]"
                  :key="`period-${item.id}`"
                  class="memory-space__bubble"
                >
                  <p class="memory-space__role">
                    {{ item.periodKind === 'weekly' ? '周总结' : '月总结' }} ·
                    {{ formatDay(item.periodStart) }}～{{ formatDay(item.periodEnd) }} · 分
                    {{ item.significance?.toFixed?.(1) ?? item.significance }}
                  </p>
                  <p class="memory-space__content">{{ item.summary }}</p>
                </article>
              </template>

              <p
                v-if="
                  nonPeriodItems.length === 0 &&
                  (layer !== 'all' || (weeklyPeriods.length === 0 && monthlyPeriods.length === 0))
                "
                class="chat-theme__hint memory-space__status"
              >
                暂无记忆条目
              </p>
            </div>
          </template>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-entry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.memory-entry__btn {
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

.memory-entry__btn:hover {
  filter: brightness(1.05);
}

.memory-space {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
  background: rgba(15, 23, 42, 0.28);
}

.memory-space__shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: linear-gradient(165deg, #fff 0%, #fdf2f8 48%, #eff6ff 100%);
}

.memory-space__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #fce7f3;
  background: rgba(255, 255, 255, 0.92);
}

.memory-space__badge {
  display: inline-block;
  margin: 0 0 8px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #fce7f3;
  color: #be185d;
  font-size: 11px;
  font-weight: 700;
}

.memory-space__title-block h1 {
  margin: 0;
  font-size: 22px;
  color: #111827;
}

.memory-space__icon-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid #fbcfe8;
  border-radius: 999px;
  background: #fff;
  color: #be185d;
  font-size: 22px;
  line-height: 34px;
  cursor: pointer;
}

.memory-space__main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 20px 20px;
  overflow: hidden;
}

.memory-space__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.memory-space__select {
  width: auto;
  min-width: 160px;
  max-width: 240px;
}

.memory-space__status {
  text-align: center;
}

.memory-space__period-panels {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  overflow: hidden;
}

.memory-space__period-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 12px;
  border: 1px solid #fce7f3;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  overflow: hidden;
}

.memory-space__feed {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding: 2px;
}

.memory-space__bubble {
  align-self: flex-start;
  max-width: 92%;
  padding: 10px 12px;
  border-radius: 14px;
  border-bottom-left-radius: 4px;
  background: #fdf2f8;
  border: 1px solid #fbcfe8;
  color: #374151;
  line-height: 1.55;
}

.memory-space__role {
  margin: 0 0 4px;
  font-size: 10px;
  font-weight: 700;
  color: #9d174d;
  opacity: 0.85;
}

.memory-space__content {
  margin: 0;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.memory-space__meta {
  margin: 6px 0 0;
  font-size: 11px;
  color: #be185d;
  opacity: 0.9;
}

@media (max-width: 720px) {
  .memory-space__period-panels {
    grid-template-columns: 1fr;
  }
}
</style>
