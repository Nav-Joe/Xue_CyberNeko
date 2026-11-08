export type RuntimeComponentId =
  | 'live2d-model'
  | 'tts-sidecar'
  | 'stt-sensevoice'
  | 'qwen-weights'
  | 'llama-local'
  | 'alt-engine-bert'

export type RuntimeComponentStatus = {
  id: RuntimeComponentId
  title: string
  summary: string
  required: boolean
  installed: boolean
  canInstall: boolean
  canUninstall: boolean
  uninstallBlockedReason: string | null
  sizeLabel: string | null
  license: { title: string; lines: string[]; url: string } | null
}

export type RuntimeEnvJobResult = {
  ok: boolean
  detail: string
}
