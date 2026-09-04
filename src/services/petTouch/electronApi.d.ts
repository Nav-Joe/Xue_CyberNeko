import type { PetTouchElectronApi } from './types'

declare global {
  interface ElectronAPI extends PetTouchElectronApi {}
}

export {}
