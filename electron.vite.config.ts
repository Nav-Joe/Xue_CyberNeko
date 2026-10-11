import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'path'
import type { Plugin } from 'vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/** 冷启动 splash.html + 猫爪素材需跟主进程产物同目录，供 loadFile */
function copySplashHtmlPlugin(): Plugin {
  const htmlSrc = resolve(__dirname, 'electron/main/windows/splash.html')
  const htmlDest = resolve(__dirname, 'out/main/splash.html')
  const assetsSrc = resolve(__dirname, 'electron/main/windows/assets')
  const assetsDest = resolve(__dirname, 'out/main/assets')
  const copy = (): void => {
    if (existsSync(htmlSrc)) {
      mkdirSync(dirname(htmlDest), { recursive: true })
      copyFileSync(htmlSrc, htmlDest)
    }
    if (existsSync(assetsSrc)) {
      mkdirSync(assetsDest, { recursive: true })
      cpSync(assetsSrc, assetsDest, { recursive: true })
    }
  }
  return {
    name: 'xue-copy-splash-html',
    buildStart: copy,
    closeBundle: copy
  }
}

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
    plugins: [externalizeDepsPlugin(), optionalLocalScreenCompanionPocPlugin(), copySplashHtmlPlugin()]
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
