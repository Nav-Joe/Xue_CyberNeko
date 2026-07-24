import { join } from 'path'
import { app } from 'electron'

import { openMemoryDbAt, type MemoryDatabase } from './dbCore'

export type { MemoryDatabase } from './dbCore'
export { openMemoryDbAt } from './dbCore'

let sqliteHandle: import('better-sqlite3').Database | null = null
let db: MemoryDatabase | null = null

/** 运行时库路径：{userData}/memory.db */
export function resolveMemoryDbPath(): string {
  return join(app.getPath('userData'), 'memory.db')
}

/**
 * 迁移 SQL 目录。
 * - 开发：仓库内 `electron/main/memory/migrations`
 * - 打包：`process.resourcesPath/memory-migrations`（打包步骤须拷贝；未配则启动会失败，避免静默无表）
 */
export function resolveMigrationsFolder(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'memory-migrations')
  }
  return join(app.getAppPath(), 'electron/main/memory/migrations')
}

/** 打开默认库并应用待执行迁移。 */
export function openMemoryDb(dbPath = resolveMemoryDbPath()): MemoryDatabase {
  if (db && sqliteHandle) {
    return db
  }

  const opened = openMemoryDbAt(dbPath, resolveMigrationsFolder())
  sqliteHandle = opened.sqlite
  db = opened.db
  return db
}

/** 测试 / 关闭钩子：释放单例句柄 */
export function closeMemoryDb(): void {
  if (sqliteHandle) {
    sqliteHandle.close()
  }
  sqliteHandle = null
  db = null
}

export function getMemoryDb(): MemoryDatabase {
  if (!db) {
    throw new Error('Memory DB not opened; call openMemoryDb() first')
  }
  return db
}
