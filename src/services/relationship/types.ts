/** 好感域 preload 扁平 API（与 `electron/preload/relationshipApi.ts` 对齐） */
export type RelationshipElectronApi = {
  relationshipGetStatus: () => Promise<{
    ready: boolean
    memoryEnabled: boolean
    relationshipEnabled: boolean
    active: boolean
  }>
  relationshipGetPromptBlock: () => Promise<
    { ok: true; block: string } | { ok: false; detail: string; block: string }
  >
  relationshipGetSnapshot: (payload?: {
    nowMs?: number
  }) => Promise<
    | {
        ok: true
        scores: { closeness: number; trust: number; rapport: number }
        tags: { closeness: string; trust: string; rapport: string }
        netToday: { closeness: number; trust: number; rapport: number }
      }
    | { ok: false; detail: string }
  >
  relationshipApplyEval: (payload: {
    rounds: Array<{ userText: string; assistantText: string }>
    source: 'llm_turn' | 'chat_close'
  }) => Promise<{ ok: true; skipped?: string; applied?: number } | { ok: false; detail: string }>
}
