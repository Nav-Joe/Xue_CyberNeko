export interface BootStep {
  id: string
  label: string
}

export const VOICE_CREATE_BOOT_STEPS: BootStep[] = [
  { id: 'generating', label: '生成克隆参考音' },
  { id: 'review', label: '试听确认' },
  { id: 'prewarming', label: '预热触摸台词' },
  { id: 'ready', label: '放出桌宠' }
]

export const VOICE_SWITCH_BOOT_STEPS: BootStep[] = [
  { id: 'switching', label: '切换声线配置' },
  { id: 'prewarming', label: '预热触摸台词' },
  { id: 'ready', label: '放出桌宠' }
]

export const CORPUS_PREWARM_BOOT_STEPS: BootStep[] = [
  { id: 'prewarming', label: '预热触摸台词' },
  { id: 'ready', label: '放出桌宠' }
]
