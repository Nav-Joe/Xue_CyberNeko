import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts']
  },
  resolve: { alias: { '@renderer': resolve(__dirname, 'src') } }
})
