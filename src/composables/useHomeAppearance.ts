import { computed, ref } from 'vue'
import {
  readHomeAppearance,
  subscribeHomeAppearance,
  toggleHomeAppearance,
  writeHomeAppearance,
  type HomeAppearance
} from '../services/homeAppearance'

/** 同一渲染窗内共用，避免聊天主界面和设置页各持一份、本窗切换不同步。 */
const appearance = ref<HomeAppearance>(readHomeAppearance())
let listening = false

function ensureListening(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  appearance.value = readHomeAppearance()
  subscribeHomeAppearance((next) => {
    appearance.value = next
  })
}

export function useHomeAppearance() {
  ensureListening()
  const isDark = computed(() => appearance.value === 'dark')

  function toggleAppearance(): void {
    appearance.value = toggleHomeAppearance(appearance.value)
    writeHomeAppearance(appearance.value)
  }

  return { appearance, isDark, toggleAppearance }
}
