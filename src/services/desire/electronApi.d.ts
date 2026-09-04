import type { DesireElectronApi } from './types'

declare global {
  interface ElectronAPI extends DesireElectronApi {}
}

export {}
