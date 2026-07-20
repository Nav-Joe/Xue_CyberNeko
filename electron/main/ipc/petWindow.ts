import { BrowserWindow, ipcMain } from 'electron'

export type PetWindowIpcDeps = {
  getPetWindow: () => BrowserWindow | null
  getPetWindowSize: () => { width: number; height: number }
  lockPetWindowSize: (width: number, height: number) => void
  setPetWindowOverlay: (
    overlayWidth: number,
    overlayHeight: number,
    recenter?: boolean
  ) => { width: number; height: number }
  showPetWindowIfNeeded: () => void
}

export function registerPetWindowIpc(deps: PetWindowIpcDeps): void {
  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && win === deps.getPetWindow()) {
      win.setIgnoreMouseEvents(ignore, { forward: true })
    }
  })

  ipcMain.handle('get-pet-window-position', () => {
    const petWindow = deps.getPetWindow()
    if (!petWindow) {
      return { x: 0, y: 0 }
    }
    const [x, y] = petWindow.getPosition()
    return { x, y }
  })

  ipcMain.handle('set-pet-window-size', (_event, width: number, height: number) => {
    deps.lockPetWindowSize(width, height)
    deps.showPetWindowIfNeeded()
    return deps.getPetWindowSize()
  })

  ipcMain.handle(
    'set-pet-window-overlay',
    (_event, width: number, height: number, recenter?: boolean) => {
      return deps.setPetWindowOverlay(width, height, recenter ?? false)
    }
  )

  ipcMain.on('set-pet-window-position', (_event, x: number, y: number) => {
    const petWindow = deps.getPetWindow()
    if (!petWindow) return
    const { width, height } = deps.getPetWindowSize()
    petWindow.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width,
      height
    })
  })
}
