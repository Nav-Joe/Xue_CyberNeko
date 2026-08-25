import type { ScreenCompanionElectronApi } from './types'

declare global {
  interface ElectronAPI extends ScreenCompanionElectronApi {}
}

export {}
