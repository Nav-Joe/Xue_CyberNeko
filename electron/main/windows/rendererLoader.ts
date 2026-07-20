import type { BrowserWindow } from 'electron'
import { join } from 'path'

export function getRendererUrl(hash = ''): string {
  const base = process.env['ELECTRON_RENDERER_URL']
  if (base) {
    return hash ? `${base}#${hash}` : base
  }
  return join(__dirname, '../renderer/index.html')
}

export function loadRenderer(win: BrowserWindow, hash = ''): void {
  const url = getRendererUrl(hash)
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(url)
  } else {
    if (hash) {
      void win.loadFile(url, { hash })
    } else {
      void win.loadFile(url)
    }
  }
}
