import { createApp, type Component } from 'vue'
import { setRuntimeCorpus } from './services/corpus'
import { installErrorReporter, installVueErrorHandler, reportClientError } from './services/errorReporter'
import { setRealtimeInferenceEnabled } from './services/ttsSettings'
import { setTouchFeedbackMode } from './services/touchModeSettings'
import './styles/main.css'

installErrorReporter()

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
      reportClientError({
        scope: 'renderer:bootstrap',
        message: '读取触摸配置失败',
        detail: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
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
    reportClientError({
      scope: 'renderer:bootstrap',
      message: '读取触摸配置失败',
      detail: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
  }
}

async function loadRootApp(windowType: string): Promise<Component> {
  if (windowType === 'home') {
    return (await import('./HomeApp.vue')).default
  }
  if (windowType === 'chat') {
    return (await import('./ChatApp.vue')).default
  }
  return (await import('./PetApp.vue')).default
}

void bootstrapTouchConfig().finally(async () => {
  const windowType = window.electronAPI?.getWindowType() ?? 'pet'
  const RootApp = await loadRootApp(windowType)
  const app = createApp(RootApp)
  installVueErrorHandler(app)
  app.mount('#app')
})
