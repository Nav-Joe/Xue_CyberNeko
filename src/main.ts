import { createApp, type Component } from 'vue'
import { setRuntimeCorpus } from './services/corpus'
import { installErrorReporter, installVueErrorHandler, reportClientError } from './services/errorReporter'
import { setRealtimeInferenceEnabled } from './services/ttsSettings'
import { setTouchFeedbackMode } from './services/touchModeSettings'
import { refreshTtsCloudBackendCache } from './services/ttsCloudSpeech'
import './styles/main.css'

installErrorReporter()

async function bootstrapTouchConfig(): Promise<void> {
  try {
    await loadTouchFeedbackConfig()
  } finally {
    // 每个窗口启动时对齐磁盘上的语音后端，家窗口和桌宠不要各记各的
    await refreshTtsCloudBackendCache()
  }
}

async function loadTouchFeedbackConfig(): Promise<void> {
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
  if (windowType === 'env') {
    return (await import('./EnvApp.vue')).default
  }
  return (await import('./PetApp.vue')).default
}

void bootstrapTouchConfig().finally(async () => {
  const hash = window.location.hash.replace('#', '')
  const windowType = hash === 'env' ? 'env' : (window.electronAPI?.getWindowType() ?? 'pet')
  const RootApp = await loadRootApp(windowType)
  const app = createApp(RootApp)
  installVueErrorHandler(app)
  app.mount('#app')
  // 启动时枚举麦克风：不弹权限；已授权则缓存带名称的列表，供设置页秒开
  void import('./services/stt/micDevices')
    .then((m) => m.warmMicDevicesInBackground())
    .catch(() => undefined)
})
