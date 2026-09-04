/** 欲望域 preload 扁平 API（与 `electron/preload/desireApi.ts` 对齐） */
export type DesireElectronApi = {
  desireGetStatus: () => Promise<{
    ready: boolean
    memoryEnabled: boolean
    desireEnabled: boolean
    active: boolean
  }>
  desireGetPromptBlock: (payload?: {
    nowMs?: number
  }) => Promise<{ ok: true; block: string } | { ok: false; detail: string; block: string }>
  desireInsertTest: (payload: {
    name: string
    description?: string
    intensity?: number
    patienceMax?: number
    patienceRemaining?: number
  }) => Promise<{ ok: true; id: string } | { ok: false; detail: string }>
  desireApplyAfterTurn: (payload: {
    userText: string
    assistantText: string
  }) => Promise<
    | { ok: true; skipped?: string; createdIds?: string[]; touched?: number }
    | { ok: false; detail: string }
  >
}
