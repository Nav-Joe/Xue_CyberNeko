import { createApp } from 'vue'
import PetApp from './PetApp.vue'
import HomeApp from './HomeApp.vue'
import { setRuntimeCorpus } from './services/corpus'
import { setRealtimeInferenceEnabled } from './services/ttsSettings'
import { setTouchFeedbackMode } from './services/touchModeSettings'
import './styles/main.css'

async function bootstrapTouchConfig(): Promise<void> {
  if (!window.electronAPI?.readVoiceForgeConfig) {
    if (!window.electronAPI?.readTouchConfig) {
      return
    }
    try {
      const config = await window.electronAPI.readTouchConfig()
      setTouchFeedbackMode(config.mode)
      if (config.mode === 'custom_corpus') {
        setRuntimeCorpus(config.corpus)
      }
    } catch (error) {
      console.warn('[Bootstrap] 读取触摸配置失败', error)
    }
    return
  }

  try {
    const config = await window.electronAPI.readVoiceForgeConfig()
    setTouchFeedbackMode(config.mode)
    if (config.mode === 'custom_corpus' || config.mode === 'alt_engine_corpus') {
      setRuntimeCorpus(config.corpus)
    }
    if (window.electronAPI.readRealtimeInferenceFlag) {
      const flag = await window.electronAPI.readRealtimeInferenceFlag()
      setRealtimeInferenceEnabled(flag.enabled)
    }
  } catch (error) {
    console.warn('[Bootstrap] 读取触摸配置失败', error)
  }
}

const windowType = window.electronAPI?.getWindowType() ?? 'pet'
const RootApp = windowType === 'home' ? HomeApp : PetApp

void bootstrapTouchConfig().finally(() => {
  createApp(RootApp).mount('#app')
})
