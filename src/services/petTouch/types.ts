export type PetTouchPart = 'head' | 'arms' | 'body' | 'legs' | 'tail'

/** 摸摸域 preload 扁平 API（与 `electron/preload/petTouchApi.ts` 对齐） */
export type PetTouchElectronApi = {
  petTouchGetToday: (payload?: {
    nowMs?: number
  }) => Promise<
    | {
        ok: true
        dayKey: string
        counts: Record<PetTouchPart, number>
        total: number
        affectionGrants: number
        affectionCap: number
        affectionEnabled: boolean
      }
    | { ok: false; detail: string }
  >
  petTouchGetPromptBlock: (payload?: {
    nowMs?: number
  }) => Promise<{ ok: true; block: string } | { ok: false; detail: string; block: string }>
  petTouchRecord: (payload: {
    part: PetTouchPart
    nowMs?: number
  }) => Promise<
    | {
        ok: true
        dayKey: string
        counts: Record<PetTouchPart, number>
        total: number
        affectionGrants: number
        affectionCap: number
        affectionEnabled: boolean
        affectionGranted?: boolean
      }
    | { ok: false; detail: string }
  >
}
