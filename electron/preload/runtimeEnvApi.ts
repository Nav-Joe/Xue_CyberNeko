import { ipcRenderer } from 'electron'

type RuntimeComponentId =
  | 'live2d-model'
  | 'tts-sidecar'
  | 'stt-sensevoice'
  | 'qwen-weights'
  | 'llama-local'
  | 'alt-engine-bert'

type RuntimeComponentStatus = {
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

type RuntimeEnvJobResult = {
  ok: boolean
  detail: string
}

export const runtimeEnvApi = {
  openRuntimeEnvWindow: (): Promise<{ ok: true; alreadyOpen: boolean }> => {
    return ipcRenderer.invoke('runtime-env-open-window')
  },
  listRuntimeEnv: (): Promise<RuntimeComponentStatus[]> => {
    return ipcRenderer.invoke('runtime-env-list')
  },
  installRuntimeEnv: (id: RuntimeComponentId, acceptLicense = false): Promise<RuntimeEnvJobResult> => {
    return ipcRenderer.invoke('runtime-env-install', id, acceptLicense)
  },
  uninstallRuntimeEnv: (id: RuntimeComponentId): Promise<RuntimeEnvJobResult> => {
    return ipcRenderer.invoke('runtime-env-uninstall', id)
  },
  openRuntimeEnvLicense: (): Promise<{ ok: true }> => {
    return ipcRenderer.invoke('runtime-env-open-license')
  },
  onRuntimeEnvLog: (callback: (payload: { id: RuntimeComponentId; line: string }) => void): (() => void) => {
    const listener = (_event: unknown, payload: { id: RuntimeComponentId; line: string }): void => {
      callback(payload)
    }
    ipcRenderer.on('runtime-env-log', listener)
    return () => {
      ipcRenderer.removeListener('runtime-env-log', listener)
    }
  }
}
