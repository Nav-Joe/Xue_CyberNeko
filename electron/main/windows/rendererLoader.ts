import type { BrowserWindow } from 'electron'

import { selectRendererUrl } from './rendererProtocol'

export function getRendererUrl(hash = ''): string {
  return selectRendererUrl(process.env['ELECTRON_RENDERER_URL'], hash)
}

export function loadRenderer(win: BrowserWindow, hash = ''): void {
  void win.loadURL(getRendererUrl(hash))
}
