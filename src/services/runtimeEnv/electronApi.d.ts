import type { RuntimeComponentId, RuntimeComponentStatus, RuntimeEnvJobResult } from './types'

export type RuntimeEnvElectronApi = {
  openRuntimeEnvWindow: () => Promise<{ ok: true; alreadyOpen: boolean }>
  listRuntimeEnv: () => Promise<RuntimeComponentStatus[]>
  installRuntimeEnv: (id: RuntimeComponentId, acceptLicense?: boolean) => Promise<RuntimeEnvJobResult>
  uninstallRuntimeEnv: (id: RuntimeComponentId) => Promise<RuntimeEnvJobResult>
  openRuntimeEnvLicense: () => Promise<{ ok: true }>
  onRuntimeEnvLog: (callback: (payload: { id: RuntimeComponentId; line: string }) => void) => () => void
}

declare global {
  interface ElectronAPI extends RuntimeEnvElectronApi {}
}

export {}
