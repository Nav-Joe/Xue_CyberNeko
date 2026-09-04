import type { MemoryElectronApi } from './types'

declare global {
  interface ElectronAPI extends MemoryElectronApi {}
}

export {}
