<script setup lang="ts">



import { computed, onMounted, provide } from 'vue'







import { useCharacterCardWorkbench } from '../../composables/chat/useCharacterCardWorkbench'



import { CHARACTER_CARD_WORKBENCH_KEY } from '../../composables/chat/characterCardWorkbenchContext'







import ChatCharacterCardSettings from './ChatCharacterCardSettings.vue'



import ChatLlmSettings from './ChatLlmSettings.vue'



import ChatTtsSettings from './ChatTtsSettings.vue'







import './chat-panel-theme.css'







const props = defineProps<{

  ensureLocalLlamaReady?: () => Promise<boolean>

}>()

const emit = defineEmits<{



  back: []



  changed: []



}>()

const workbench = useCharacterCardWorkbench()



provide(CHARACTER_CARD_WORKBENCH_KEY, workbench)







const activeCard = computed(() => workbench.draft.value ?? workbench.activeCard.value)







onMounted(() => {



  void workbench.reload()



})







function onSettingsChanged(): void {



  emit('changed')



}







function onCardChanged(): void {



  emit('changed')



}



</script>







<template>



  <div class="chat-settings">



    <header class="chat-settings__header">



      <button type="button" class="chat-settings__back" @click="emit('back')">← 返回聊天</button>



      <div class="chat-settings__title-block">



        <p class="chat-settings__badge">聊天设置</p>



        <h1>模型与角色</h1>



      </div>



    </header>







    <div class="chat-settings__body">



      <ChatTtsSettings @changed="onSettingsChanged" />

      <ChatLlmSettings
        :card="activeCard"
        :ensure-local-llama-ready="props.ensureLocalLlamaReady"
        @changed="onSettingsChanged"
      />



      <ChatCharacterCardSettings @changed="onCardChanged" />



      <p v-if="workbench.loading.value" class="chat-theme__hint chat-settings__loading">同步角色卡…</p>



    </div>



  </div>



</template>







<style scoped>



.chat-settings {



  display: flex;



  flex-direction: column;



  width: 100%;



  height: 100%;



  min-height: 0;



  background: linear-gradient(165deg, #fff 0%, #fdf2f8 48%, #eff6ff 100%);



}







.chat-settings__header {



  display: flex;



  align-items: flex-start;



  gap: 16px;



  padding: 16px 20px 12px;



  border-bottom: 1px solid #fce7f3;



  background: rgba(255, 255, 255, 0.92);



}







.chat-settings__back {



  margin-top: 6px;



  padding: 8px 12px;



  border: 1px solid #fbcfe8;



  border-radius: 999px;



  background: #fff;



  color: #be185d;



  font-size: 12px;



  font-weight: 600;



  cursor: pointer;



  white-space: nowrap;



}







.chat-settings__title-block h1 {



  margin: 0;



  font-size: 22px;



  color: #111827;



}







.chat-settings__badge {



  display: inline-block;



  margin: 0 0 8px;



  padding: 4px 12px;



  border-radius: 999px;



  background: #fce7f3;



  color: #be185d;



  font-size: 11px;



  font-weight: 700;



}







.chat-settings__body {



  flex: 1;



  min-height: 0;



  overflow-y: auto;



  padding: 16px 20px 24px;



  max-width: 720px;



}







.chat-settings__loading {



  margin-top: 8px;



}



</style>


