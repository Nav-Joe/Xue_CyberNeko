<script setup lang="ts">
import Live2DView from './components/Live2DView.vue'
import PetContextMenu from './components/PetContextMenu.vue'
import { ref } from 'vue'

const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

function openMenu(payload: { x: number; y: number }): void {
  menuX.value = payload.x
  menuY.value = payload.y
  menuVisible.value = true
  window.electronAPI.setIgnoreMouseEvents(false)
}

function closeMenu(): void {
  menuVisible.value = false
}

function handleMenuAction(action: 'home' | 'quit'): void {
  closeMenu()
  if (action === 'home') {
    window.electronAPI.openHome()
  } else if (action === 'quit') {
    window.electronAPI.quitApp()
  }
}
</script>

<template>
  <div class="pet-root" @click="closeMenu">
    <Live2DView mode="pet" @open-menu="openMenu" />
    <PetContextMenu
      v-if="menuVisible"
      :x="menuX"
      :y="menuY"
      @action="handleMenuAction"
      @close="closeMenu"
    />
  </div>
</template>

<style scoped>
.pet-root {
  width: 100%;
  height: 100%;
  background: transparent;
}
</style>
