import { contextBridge } from 'electron'

/**
 * 预加载脚本：在渲染进程和主进程之间建立安全桥梁。
 * 这里暴露的 API 可以在 Vue 页面中通过 window.electronAPI 访问。
 */
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform
})
