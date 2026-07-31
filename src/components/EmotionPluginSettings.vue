<script setup lang="ts">
/**
 * 记忆总闸 + 官方情感模拟插件（欲望 / 好感）。
 * 入口：桌宠右键 → 设置（二者依赖，放一起）。
 */
import { computed, onMounted, ref } from 'vue'
import { loadChatConfigView, saveChatConfigPatch } from '../services/chat/chatConfigStore'

const PLUGIN_VERSION = 'V0.1.0'

const memoryEnabled = ref(false)
const desireEnabled = ref(true)
const saving = ref(false)
const loading = ref(true)
const status = ref('')
const error = ref('')

const emotionDisabled = computed(() => saving.value || loading.value || !memoryEnabled.value)

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const config = await loadChatConfigView()
    memoryEnabled.value = config.memoryEnabled === true
    desireEnabled.value = config.desireEnabled !== false
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载设置失败'
  } finally {
    loading.value = false
  }
}

async function handleMemoryToggle(): Promise<void> {
  if (saving.value || loading.value) return
  saving.value = true
  status.value = ''
  error.value = ''
  const next = !memoryEnabled.value
  memoryEnabled.value = next
  try {
    await saveChatConfigPatch({
      memoryEnabled: next,
      memoryConsolidateOnChatClose: true,
      memoryLlmSummarizeEnabled: true,
      memoryEmotionScoreEnabled: true
    })
    if (!next) {
      // 关记忆时情感插件不可用；不强制改 desireEnabled 配置，仅 UI 显示为关
      status.value = '已关闭记忆功能'
    } else {
      status.value = '已开启记忆功能'
    }
  } catch (err) {
    memoryEnabled.value = !next
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function handleEmotionToggle(): Promise<void> {
  if (emotionDisabled.value && memoryEnabled.value) return
  if (!memoryEnabled.value) {
    status.value = '请先开启记忆功能'
    return
  }
  if (saving.value) return
  saving.value = true
  status.value = ''
  error.value = ''
  const next = !desireEnabled.value
  desireEnabled.value = next
  try {
    await saveChatConfigPatch({ desireEnabled: next, relationshipEnabled: next })
    status.value = next ? '已开启官方情感模拟插件' : '已关闭官方情感模拟插件'
  } catch (err) {
    desireEnabled.value = !next
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <section class="memory-emotion">
    <p class="section-label">记忆与情感</p>
    <div class="setting-card">
      <div class="setting-row">
        <span class="label">开启记忆功能</span>
        <button
          type="button"
          class="ios-switch"
          :class="{ 'ios-switch--on': memoryEnabled }"
          role="switch"
          :aria-checked="memoryEnabled"
          :disabled="saving || loading"
          @click="handleMemoryToggle"
        >
          <span class="ios-switch__track">
            <span class="ios-switch__knob" />
          </span>
        </button>
      </div>
      <p class="hint">
        开启后可使用完整记忆（不建议本地大模型作主路径；后续优化以第三方 API 为准）
      </p>

      <div class="divider" />

      <div class="setting-row">
        <span class="label">
          官方情感模拟插件
          <span class="version">{{ PLUGIN_VERSION }}</span>
        </span>
        <button
          type="button"
          class="ios-switch"
          :class="{ 'ios-switch--on': desireEnabled && memoryEnabled }"
          role="switch"
          :aria-checked="desireEnabled && memoryEnabled"
          :disabled="emotionDisabled"
          @click="handleEmotionToggle"
        >
          <span class="ios-switch__track">
            <span class="ios-switch__knob" />
          </span>
        </button>
      </div>
      <p v-if="loading" class="hint">加载中…</p>
      <p v-else-if="!memoryEnabled" class="hint warn">需先开启记忆，再启用本插件（含欲望与三维好感）</p>
      <p v-else class="hint">官方默认情感插件，含欲望与三维好感；推荐开启</p>

      <p v-if="status" class="hint">{{ status }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.memory-emotion {
  margin: 0 0 12px;
}

.section-label {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}

.setting-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.version {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #9d174d;
  background: #fce7f3;
  border-radius: 999px;
  padding: 2px 8px;
}

.divider {
  height: 1px;
  margin: 12px 0;
  background: rgba(0, 0, 0, 0.06);
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.45;
}

.hint.warn {
  color: #b45309;
}

.error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #b91c1c;
}

.ios-switch {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.ios-switch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ios-switch__track {
  display: block;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: #d1d5db;
  position: relative;
  transition: background 0.2s ease;
}

.ios-switch--on .ios-switch__track {
  background: #db2777;
}

.ios-switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.ios-switch--on .ios-switch__knob {
  transform: translateX(18px);
}
</style>
