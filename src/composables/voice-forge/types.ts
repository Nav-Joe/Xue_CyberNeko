export interface VoiceSampleItem {
  folderId: string
  displayName: string
  kind: 'official' | 'custom'
  hasReference: boolean
}

export type ForgeTab = 'update' | 'create'

export interface CreateSubmitPayload {
  displayName: string
  corpus: import('../../types/corpus').CorpusData
  instruct: string
}

export interface UploadStartPayload {
  displayName: string
  corpus: import('../../types/corpus').CorpusData
  referenceText: string
}

export interface PrewarmPayload {
  folderId: string
  displayName: string
  corpus: import('../../types/corpus').CorpusData
}

export interface VoiceForgeConfirmOpts {
  title: string
  message: string
  confirmLabel: string
}
