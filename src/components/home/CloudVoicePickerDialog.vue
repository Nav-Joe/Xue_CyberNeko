<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import './cloud-picker-dialog.css'

type ProviderRow = {
  id: string
  label: string
}

type VoiceRow = {
  id: string
  kind?: 'vc' | 'vd'
  name: string
  speaker?: string
}

const props = defineProps<{
  open: boolean
  providers: ProviderRow[]
  voicesByProvider: Record<string, VoiceRow[]>
  activeId: string
  busy: boolean
  seedHasKey: boolean
  aliBaseUrl: string
  aliVcModel: string
  aliVdModel: string
  aliSecretSave: boolean
  aliHasKey: boolean
  aliApiKey: string
}>()

const emit = defineEmits<{
  close: []
  switch: [providerId: string, localId: string]
  delete: [providerId: string, localId: string]
  saveSeed: [payload: { apiKey: string; resourceId: string; speaker: string; name: string }]
  saveEdge: [payload: { speaker: string; name: string }]
  saveAli: [payload: {
    baseUrl: string
    vcModel: string
    vdModel: string
    secretSave: boolean
    apiKey: string
  }]
  previewAli: [payload: {
    baseUrl: string
    vcModel: string
    vdModel: string
    secretSave: boolean
    apiKey: string
    text: string
  }]
}>()

const dialogRef = ref<HTMLElement | null>(null)
const selectedId = ref<string | null>(null)
const seedKey = ref('')
const seedResourceId = ref('seed-tts-2.0')
const seedName = ref('')
const seedSpeaker = ref('')
const edgeName = ref('')
const edgeSpeaker = ref('')
const aliBaseUrl = ref('')
const aliVcModel = ref('')
const aliVdModel = ref('')
const aliSecretSave = ref(false)
const aliApiKey = ref('')
const aliPreviewText = ref('你好，这是云端语音试听。')

const selectedLabel = computed(() => {
  return props.providers.find((item) => item.id === selectedId.value)?.label || '云服务'
})

function dialogFocusable(): HTMLElement[] {
  const root = dialogRef.value
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')]
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const nodes = dialogFocusable()
  if (nodes.length === 0) {
    event.preventDefault()
    return
  }
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement
  const inside = active instanceof Node && Boolean(dialogRef.value?.contains(active))
  if (event.shiftKey) {
    if (!inside || active === first || active === dialogRef.value) {
      event.preventDefault()
      last.focus()
    }
    return
  }
  if (!inside || active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (open) => {
    window.removeEventListener('keydown', onDialogKeydown, true)
    if (!open) return
    selectedId.value = null
    window.addEventListener('keydown', onDialogKeydown, true)
    void nextTick(() => dialogRef.value?.focus())
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDialogKeydown, true)
})

watch(selectedId, (id) => {
  if (id !== 'qwen') return
  aliBaseUrl.value = props.aliBaseUrl
  aliVcModel.value = props.aliVcModel
  aliVdModel.value = props.aliVdModel
  aliSecretSave.value = props.aliSecretSave
  aliApiKey.value = props.aliApiKey
  void nextTick(() => dialogRef.value?.focus())
})

function kindLabel(kind: VoiceRow['kind']): string {
  if (kind === 'vd') return '云设计'
  if (kind === 'vc') return '云克隆'
  return '音色'
}

function voiceCount(id: string): number {
  return props.voicesByProvider[id]?.length ?? 0
}

function voicesForSelected(): VoiceRow[] {
  if (!selectedId.value) return []
  return props.voicesByProvider[selectedId.value] ?? []
}

function emptyHint(): string {
  if (selectedId.value === 'qwen') return '还没有声线。去音色工坊做云克隆或声音设计。'
  if (selectedId.value === 'edge') return '还没有声线。填写 Neural 名称后点添加。'
  return '还没有声线。填写 Speaker 后点添加。'
}

function selectProvider(id: string): void {
  selectedId.value = id
}

function backToProviders(): void {
  selectedId.value = null
}

function aliPayload() {
  return {
    baseUrl: aliBaseUrl.value.trim(),
    vcModel: aliVcModel.value.trim(),
    vdModel: aliVdModel.value.trim(),
    secretSave: aliSecretSave.value,
    apiKey: aliApiKey.value
  }
}

function submitAli(): void {
  emit('saveAli', aliPayload())
}

function previewAli(): void {
  emit('previewAli', { ...aliPayload(), text: aliPreviewText.value })
}

function submitEdge(): void {
  if (!edgeSpeaker.value.trim()) return
  emit('saveEdge', { speaker: edgeSpeaker.value.trim(), name: edgeName.value.trim() })
  edgeSpeaker.value = ''
  edgeName.value = ''
}

function submitSeed(): void {
  emit('saveSeed', {
    apiKey: seedKey.value.trim(),
    resourceId: seedResourceId.value.trim() || 'seed-tts-2.0',
    speaker: seedSpeaker.value.trim(),
    name: seedName.value.trim()
  })
  seedSpeaker.value = ''
  seedName.value = ''
}

</script>

<template>
  <Teleport to=".home">
    <div v-if="open" class="cloud-picker-mask" @click.self="emit('close')">
      <div
        ref="dialogRef"
        class="cloud-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-picker-title"
        tabindex="-1"
      >
        <header class="cloud-picker__head">
          <button
            v-if="selectedId"
            type="button"
            class="cloud-picker__text-btn"
            @click="backToProviders"
          >
            返回
          </button>
          <div class="cloud-picker__heading">
            <h2 id="cloud-picker-title" class="cloud-picker__title">
              {{ selectedId ? selectedLabel : '挑选声线' }}
            </h2>
            <p class="cloud-picker__lead">
              {{ selectedId ? '保存连接，或在下面切换声线。' : '先选云服务，再选这条服务里的声线。' }}
            </p>
          </div>
          <button type="button" class="cloud-picker__text-btn" @click="emit('close')">关闭</button>
        </header>

        <div v-if="!selectedId" class="cloud-picker__services">
          <p v-if="providers.length === 0" class="cloud-picker__empty">还没有接上的云服务。</p>
          <button
            v-for="provider in providers"
            :key="provider.id"
            type="button"
            class="cloud-picker__service"
            @click="selectProvider(provider.id)"
          >
            <span class="cloud-picker__service-name">{{ provider.label }}</span>
            <span class="cloud-picker__meta">
              {{ voiceCount(provider.id) === 0 ? '还没有声线' : `${voiceCount(provider.id)} 条声线` }}
            </span>
          </button>
        </div>

        <div v-else class="cloud-picker__detail">
          <form v-if="selectedId === 'qwen'" class="cloud-picker__form" @submit.prevent="submitAli">
            <label class="cloud-picker__field cloud-picker__field--wide">
              地址根
              <input v-model="aliBaseUrl" class="cloud-picker__input" type="text" :disabled="busy" placeholder="https://dashscope.aliyuncs.com" />
            </label>
            <label class="cloud-picker__field">
              复刻与合成模型
              <input v-model="aliVcModel" class="cloud-picker__input" type="text" :disabled="busy" placeholder="qwen-audio-3.1-tts-flash" />
            </label>
            <label class="cloud-picker__field">
              声音设计模型
              <input v-model="aliVdModel" class="cloud-picker__input" type="text" :disabled="busy" placeholder="qwen-audio-3.1-tts-flash" />
            </label>
            <label class="cloud-picker__field cloud-picker__field--wide">
              API Key
              <input v-model="aliApiKey" class="cloud-picker__input" type="password" :disabled="busy" autocomplete="off" :placeholder="aliSecretSave && aliHasKey ? '留空则不修改已保存的 Key' : '阿里云 API Key'" />
            </label>
            <label class="cloud-picker__check">
              <input v-model="aliSecretSave" type="checkbox" :disabled="busy" />
              <span>私密保存 Key</span>
            </label>
            <p class="cloud-picker__note">填主机或 /api/v1 根即可。换模型只改模型名。</p>
            <div class="cloud-picker__actions">
              <button type="submit" class="cloud-picker__primary" :disabled="busy">保存配置</button>
            </div>
            <label class="cloud-picker__field cloud-picker__field--wide">
              试听文本
              <input v-model="aliPreviewText" class="cloud-picker__input" type="text" :disabled="busy" />
            </label>
            <div class="cloud-picker__actions">
              <button type="button" class="voice-action" :disabled="busy" @click="previewAli">试听</button>
            </div>
          </form>

          <form v-if="selectedId === 'seed'" class="cloud-picker__form" @submit.prevent="submitSeed">
            <label class="cloud-picker__field">
              API Key
              <input v-model="seedKey" class="cloud-picker__input" type="password" :disabled="busy" placeholder="火山引擎 API Key" />
            </label>
            <label class="cloud-picker__field">
              模型
              <input v-model="seedResourceId" class="cloud-picker__input" type="text" :disabled="busy" placeholder="seed-tts-2.0" />
            </label>
            <label class="cloud-picker__field">
              声线名称
              <input v-model="seedName" class="cloud-picker__input" type="text" :disabled="busy" placeholder="例如：女声" />
            </label>
            <label class="cloud-picker__field">
              Speaker
              <input v-model="seedSpeaker" class="cloud-picker__input" type="text" :disabled="busy" placeholder="控制台音色 ID" />
            </label>
            <p v-if="seedHasKey" class="cloud-picker__note">已保存 API Key。留空再添加声线不会覆盖密钥。</p>
            <div class="cloud-picker__actions">
              <button type="submit" class="cloud-picker__primary" :disabled="busy || !seedSpeaker.trim()">添加声线</button>
            </div>
          </form>

          <form v-if="selectedId === 'edge'" class="cloud-picker__form" @submit.prevent="submitEdge">
            <label class="cloud-picker__field">
              声线名称
              <input v-model="edgeName" class="cloud-picker__input" type="text" :disabled="busy" placeholder="例如：晓晓" />
            </label>
            <label class="cloud-picker__field">
              Neural 名称
              <input v-model="edgeSpeaker" class="cloud-picker__input" type="text" :disabled="busy" placeholder="zh-CN-XiaoxiaoNeural" />
            </label>
            <p class="cloud-picker__note">Edge 不需要 API Key。下面是常用中文声线，也可以再加别的 Neural 名称。</p>
            <div class="cloud-picker__actions">
              <button type="submit" class="cloud-picker__primary" :disabled="busy || !edgeSpeaker.trim()">添加声线</button>
            </div>
          </form>

          <section class="cloud-picker__voices" aria-label="声线列表">
            <h3 class="cloud-picker__section">声线</h3>
            <p v-if="voicesForSelected().length === 0" class="cloud-picker__empty">{{ emptyHint() }}</p>
            <ul v-else class="cloud-picker__list">
              <li
                v-for="row in voicesForSelected()"
                :key="row.id"
                class="cloud-picker__voice"
                :class="{ 'cloud-picker__voice--on': row.id === activeId }"
              >
                <div class="cloud-picker__voice-body">
                  <span class="cloud-picker__voice-name">{{ row.name }}</span>
                  <span class="cloud-picker__meta">{{ row.speaker || kindLabel(row.kind) }}</span>
                  <span v-if="row.id === activeId" class="cloud-picker__voice-active">当前使用</span>
                </div>
                <div class="cloud-picker__voice-actions">
                  <button
                    type="button"
                    class="voice-action"
                    :disabled="busy || row.id === activeId"
                    @click="emit('switch', selectedId || '', row.id)"
                  >
                    {{ row.id === activeId ? '使用中' : '切换' }}
                  </button>
                  <button
                    type="button"
                    class="voice-action voice-action--danger"
                    :disabled="busy"
                    @click="emit('delete', selectedId || '', row.id)"
                  >
                    删除
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

