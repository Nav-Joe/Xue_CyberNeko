import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit 配置（M4 记忆库）。
 * - schema / out：源码侧权威定义与迁移产物
 * - dbCredentials.url：仅供 CLI `drizzle-kit migrate` 校验；运行时库路径见 electron/main/memory/db.ts（userData/memory.db）
 */
export default defineConfig({
  schema: './electron/main/memory/schema.ts',
  out: './electron/main/memory/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './.runtime/memory-kit-check.db'
  }
})
