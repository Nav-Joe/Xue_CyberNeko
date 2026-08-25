import { existsSync } from 'node:fs'
import { resolve } from 'path'
import type { Plugin } from 'vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/** 本地 POC/verify 钩子：文件被 gitignore；缺省时导出 null，产品构建不受影响 */
function optionalLocalScreenCompanionPocPlugin(): Plugin {
  const virtualId = '\0virtual:xue-local-screen-companion-poc'
  const localFile = resolve(__dirname, 'electron/main/screenCompanion/localPocAppModes.ts')
  return {
    name: 'xue-optional-local-screen-companion-poc',
    resolveId(id) {
      if (id === 'virtual:xue-local-screen-companion-poc') return virtualId
    },
    load(id) {
      if (id !== virtualId) return null
      if (!existsSync(localFile)) {
        return 'export const localPoc = null\n'
      }
      const importPath = localFile.replace(/\\/g, '/')
      return `export { localPoc } from '${importPath}'\n`
    }
  }
}

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin(), optionalLocalScreenCompanionPocPlugin()]
  },
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: '.',
    server: {
      watch: {
        // 大文件下载/解压时避免 Windows 上 FSWatcher EBUSY 导致 dev 崩溃
        ignored: ['**/.runtime/**', '**/llama_bin/**', '**/llama_models/**']
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src')
      }
    },
    plugins: [
      vue(),
      nodePolyfills({
        include: ['url']
      })
    ],
    optimizeDeps: {
      include: ['url', '@pixi/utils', '@pixi/unsafe-eval'],
      exclude: ['pixi-live2d-display']
    }
  }
})
