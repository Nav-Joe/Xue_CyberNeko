import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin()]
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
