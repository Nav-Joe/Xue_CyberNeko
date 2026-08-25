/** 可选本地 POC/verify（缺省文件时为 null；见 electron.vite.config.ts） */
declare module 'virtual:xue-local-screen-companion-poc' {
  export type LocalScreenCompanionPoc = {
    active: boolean
    runWhenReady: (deps: { registerIpc: () => void }) => Promise<boolean>
  }

  export const localPoc: LocalScreenCompanionPoc | null
}
