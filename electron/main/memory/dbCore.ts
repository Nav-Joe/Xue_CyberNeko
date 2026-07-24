import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import * as schema from './schema'

export type MemoryDatabase = BetterSQLite3Database<typeof schema>

/**
 * 在指定路径打开库并应用迁移。
 * 测试与非 Electron 入口可直接调用；禁止手写 CREATE TABLE。
 */
export function openMemoryDbAt(dbPath: string, migrationsFolder: string): {
  db: MemoryDatabase
  sqlite: Database.Database
} {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return { db, sqlite }
}
