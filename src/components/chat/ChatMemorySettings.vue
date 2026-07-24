<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { loadChatConfigView, saveChatConfigPatch } from '../../services/chat/chatConfigStore'

import './chat-panel-theme.css'

const memoryEnabled = ref(false)
const saving = ref(false)
const status = ref('')
const error = ref('')

async function refresh(): Promise<void> {
  try {
    const config = await loadChatConfigView()
    memoryEnabled.value = config.memoryEnabled === true
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载记忆设置失败'
  }
}

async function persist(): Promise<void> {
  if (saving.value) return
  saving.value = true
  status.value = ''
  error.value = ''
  try {
    const on = memoryEnabled.value
    // 开启：默认打开全部记忆子能力；关闭：仅关总闸（再开仍全开）
    await saveChatConfigPatch({
      memoryEnabled: on,
      memoryConsolidateOnChatClose: true,
      memoryLlmSummarizeEnabled: true,
      memoryEmotionScoreEnabled: true
    })
    status.value = on ? '已开启记忆功能' : '已关闭记忆功能'
  } catch (err) {
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
  <section class="chat-memory-settings">
    <h3 class="chat-theme__section-title">记忆</h3>
    <p class="chat-theme__hint">
      开启后可使用完整的全部记忆功能（开启这个功能不建议使用本地大模型，虽然有做适配优化但是不能保证质量和性能，后续优化主要以第三方API模式为准，本地大模型只做应急）
    </p>
    <label class="chat-memory-settings__toggle">
      <input
        v-model="memoryEnabled"
        type="checkbox"
        :disabled="saving"
        @change="persist()"
      />
      <span>开启记忆功能</span>
    </label>
    <p v-if="status" class="chat-theme__hint">{{ status }}</p>
    <p v-if="error" class="chat-theme__error">{{ error }}</p>
  </section>
</template>

<style scoped>
.chat-memory-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid #fdf2f8;
}

.chat-memory-settings__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #fbcfe8;
  border-radius: 12px;
  background: #fff;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.chat-memory-settings__toggle input {
  accent-color: #db2777;
}
</style>
