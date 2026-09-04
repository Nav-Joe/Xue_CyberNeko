import type { RelationshipElectronApi } from './types'

declare global {
  interface ElectronAPI extends RelationshipElectronApi {}
}

export {}
