/** STT 代启 IPC 类型（独立声明，避免撑爆 env.d.ts 行数预算） */
interface ElectronAPI {
  ensureSttService: () => Promise<
    { ok: true; baseUrl: string; reused: boolean } | { ok: false; detail: string }
  >
  stopManagedSttService: () => Promise<{ ok: true; stopped: boolean }>
}
