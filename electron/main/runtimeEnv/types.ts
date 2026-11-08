/** 环境页组件编号。插件以后也挂这张表，本轮只有内置项。 */
export const RUNTIME_COMPONENT_IDS = [
  'live2d-model',
  'tts-sidecar',
  'stt-sensevoice',
  'qwen-weights',
  'llama-local',
  'alt-engine-bert'
] as const

export type RuntimeComponentId = (typeof RUNTIME_COMPONENT_IDS)[number]

export type RuntimeComponentLicense = {
  title: string
  lines: string[]
  url: string
}

export type RuntimeComponentStatus = {
  id: RuntimeComponentId
  title: string
  summary: string
  required: boolean
  installed: boolean
  canInstall: boolean
  canUninstall: boolean
  /** 不能卸时给界面的原因；能卸则为 null */
  uninstallBlockedReason: string | null
  /** 磁盘上已有文件时的真实占用；还没下载则为 null */
  sizeLabel: string | null
  license: RuntimeComponentLicense | null
}

export type RuntimeEnvJobResult = {
  ok: boolean
  detail: string
}

export function isRuntimeComponentId(value: unknown): value is RuntimeComponentId {
  return typeof value === 'string' && (RUNTIME_COMPONENT_IDS as readonly string[]).includes(value)
}
