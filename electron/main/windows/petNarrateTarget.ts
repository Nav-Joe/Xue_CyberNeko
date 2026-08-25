/**
 * 桌宠旁白 IPC 投递目标（webContents id）。
 * 独立小模块，避免 narrateDelivery 与 petWindow 双份 bundle 单例不一致。
 */
import { BrowserWindow, webContents } from 'electron'

let petNarrateWebContentsId: number | null = null

export function resetPetNarrateTargetRegistry(): void {
  petNarrateWebContentsId = null
}

export function registerPetNarrateTarget(webContentsId: number): void {
  petNarrateWebContentsId = webContentsId
}

export function unregisterPetNarrateTarget(webContentsId: number): void {
  if (petNarrateWebContentsId === webContentsId) {
    petNarrateWebContentsId = null
  }
}

export function getRegisteredPetNarrateWebContentsId(): number | null {
  return petNarrateWebContentsId
}

function isPetNarrateUrl(url: string): boolean {
  if (!url || url === 'about:blank') return false
  if (url.includes('#home') || url.includes('#chat')) return false
  return url.includes('#pet') || !url.includes('#')
}

/** 解析可接收 screen-companion-narrate 的 webContents */
export function resolvePetNarrateWebContents(): Electron.WebContents | null {
  if (petNarrateWebContentsId != null) {
    const wc = webContents.fromId(petNarrateWebContentsId)
    if (wc && !wc.isDestroyed()) return wc
    petNarrateWebContentsId = null
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    let url = ''
    try {
      url = win.webContents.getURL()
    } catch {
      continue
    }
    if (!isPetNarrateUrl(url)) continue
    petNarrateWebContentsId = win.webContents.id
    return win.webContents
  }

  return null
}

export type PetNarrateResolveDiagnostics = {
  registeredId: number | null
  windowCount: number
  windows: Array<{ id: number; url: string; title: string; destroyed: boolean }>
}

export function describePetNarrateResolveFailure(): PetNarrateResolveDiagnostics {
  const windows: PetNarrateResolveDiagnostics['windows'] = []
  for (const win of BrowserWindow.getAllWindows()) {
    let url = ''
    try {
      url = win.webContents.getURL()
    } catch {
      url = '(unreadable)'
    }
    windows.push({
      id: win.webContents.id,
      url,
      title: win.getTitle(),
      destroyed: win.isDestroyed()
    })
  }
  return {
    registeredId: petNarrateWebContentsId,
    windowCount: windows.length,
    windows
  }
}
