<script setup lang="ts">
import Live2DView from '../../components/Live2DView.vue'
import PetContextMenu from '../../components/PetContextMenu.vue'

defineProps<{
  petReady: boolean
  petStage: { width: number; height: number }
  menuVisible: boolean
  menuX: number
  menuY: number
  chatShortcutDisabled?: boolean
}>()

defineEmits<{
  'open-menu': [payload: { x: number; y: number }]
  'pet-frame-ready': [payload: { width: number; height: number }]
  'menu-action': [action: 'home' | 'quit']
  'close-menu': []
  'chat-shortcut-click': []
}>()
</script>

<template>
  <div
    v-if="petReady"
    class="pet-stage"
    :style="{ width: `${petStage.width}px`, height: `${petStage.height}px` }"
  >
    <Live2DView
      mode="pet"
      :interaction-locked="menuVisible || !petReady"
      :chat-shortcut-disabled="chatShortcutDisabled"
      @open-menu="$emit('open-menu', $event)"
      @pet-frame-ready="$emit('pet-frame-ready', $event)"
      @chat-shortcut-click="$emit('chat-shortcut-click')"
    />
  </div>

  <div
    v-if="menuVisible"
    class="menu-dismiss-layer"
    aria-hidden="true"
    @click="$emit('close-menu')"
  />

  <PetContextMenu
    v-if="menuVisible"
    :x="menuX"
    :y="menuY"
    @action="$emit('menu-action', $event)"
    @close="$emit('close-menu')"
  />
</template>

<style scoped>
.pet-stage {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  overflow: hidden;
}

.menu-dismiss-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: transparent;
  cursor: default;
}
</style>
