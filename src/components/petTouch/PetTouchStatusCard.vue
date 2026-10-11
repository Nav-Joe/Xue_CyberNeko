<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { BODY_PART_LABELS, BODY_PART_ORDER } from '../../constants/voiceForge'
import {
  getPetTouchToday,
  PET_TOUCH_RECORDED_EVENT,
  type PetTouchDayView
} from '../../services/petTouch/petTouchClient'

const loading = ref(false)
const error = ref('')
const snapshot = ref<PetTouchDayView | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    snapshot.value = await getPetTouchToday()
    if (!snapshot.value) {
      error.value = '摸摸数据暂不可用（记忆库未就绪）'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function onRecorded(ev: Event): void {
  const detail = (ev as CustomEvent<PetTouchDayView>).detail
  if (detail?.counts) {
    snapshot.value = detail
    error.value = ''
  }
}

onMounted(() => {
  void load()
  window.addEventListener(PET_TOUCH_RECORDED_EVENT, onRecorded)
})

onUnmounted(() => {
  window.removeEventListener(PET_TOUCH_RECORDED_EVENT, onRecorded)
})
</script>

<template>
  <section class="pet-touch-card" aria-label="今日摸摸状况">
    <header class="pet-touch-card__header">
      <h2 class="pet-touch-card__title">今日摸摸状况</h2>
      <button type="button" class="pet-touch-card__refresh" :disabled="loading" @click="load">
        刷新
      </button>
    </header>

    <p v-if="loading && !snapshot" class="pet-touch-card__hint">加载中…</p>
    <p v-else-if="error && !snapshot" class="pet-touch-card__error">{{ error }}</p>
    <template v-else-if="snapshot">
      <p class="pet-touch-card__total">
        今日共摸 <strong>{{ snapshot.total }}</strong> 次
      </p>
      <p v-if="snapshot.affectionEnabled" class="pet-touch-card__total">
        今日亲近加分
        <strong>{{ snapshot.affectionGrants }}/{{ snapshot.affectionCap }}</strong>
        <span v-if="snapshot.affectionGrants >= snapshot.affectionCap">（已达上限）</span>
      </p>
      <p v-else class="pet-touch-card__hint">亲近加分已关闭（需开启情感模拟插件）</p>
      <ul class="pet-touch-card__list">
        <li v-for="part in BODY_PART_ORDER" :key="part">
          <span>{{ BODY_PART_LABELS[part] }}</span>
          <strong>{{ snapshot.counts[part] ?? 0 }}</strong>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.pet-touch-card {
  width: 100%;
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: var(--home-radius-control, 16px);
  border: 1px solid var(--home-line, rgba(63, 42, 51, 0.12));
  background: var(--home-color-panel, #fff);
  box-sizing: border-box;
}

.pet-touch-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.pet-touch-card__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--home-color-text, #3f2a33);
}

.pet-touch-card__refresh {
  min-height: var(--home-target-sm, 36px);
  border: 1.5px solid var(--home-color-primary, #9f1239);
  border-radius: var(--home-radius-pill, 999px);
  background: var(--home-color-chip, #fde8f0);
  color: var(--home-color-primary, #9f1239);
  font-size: var(--home-font-meta, 0.8125rem);
  font-weight: 700;
  padding: 4px 12px;
  cursor: pointer;
}

.pet-touch-card__refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pet-touch-card__hint,
.pet-touch-card__error,
.pet-touch-card__total {
  margin: 0 0 8px;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.pet-touch-card__error {
  color: var(--home-color-danger, #b91c1c);
}

.pet-touch-card__hint,
.pet-touch-card__total {
  color: var(--home-color-muted, #5c4150);
}

.pet-touch-card__total strong {
  color: var(--home-color-primary, #9f1239);
}

.pet-touch-card__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8125rem;
  color: var(--home-color-muted, #5c4150);
}

.pet-touch-card__list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.pet-touch-card__list strong {
  color: var(--home-color-text, #3f2a33);
}
</style>
