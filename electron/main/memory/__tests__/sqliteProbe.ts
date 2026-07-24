import { describe } from 'vitest'

/**
 * better-sqlite3 的 JS 包装总能 require；真正 ABI 不匹配要到 new Database 才暴露。
 * 桌宠主进程用 Electron ABI；普通 `npm test` 跑在系统 Node 上，postinstall 按 Electron
 * 重编后本探测会失败 → describe.skip。
 * 完整库测请用 `npm run test:memory`（REQUIRE_MEMORY_DB=1，不可用则硬失败）。
 */
export function canLoadBetterSqlite3(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    return true
  } catch {
    return false
  }
}

export function requireMemoryDbOrThrow(): void {
  if (canLoadBetterSqlite3()) return
  throw new Error(
    [
      'better-sqlite3 无法在当前 Node 下打开（多为 Electron ABI）。',
      '请运行: npm run test:memory',
      '（会临时按 Node 重编 → 跑测 → 再恢复 Electron ABI）'
    ].join(' ')
  )
}

/**
 * 记忆库集成 describe：默认 ABI 不对齐则 skip；
 * REQUIRE_MEMORY_DB=1 时改为硬失败，避免「全绿但没测到库」。
 */
export function describeMemoryDb(
  name: string,
  factory: () => void
): void | ReturnType<typeof describe.skip> {
  const ok = canLoadBetterSqlite3()
  if (!ok && process.env.REQUIRE_MEMORY_DB === '1') {
    requireMemoryDbOrThrow()
  }
  return (ok ? describe : describe.skip)(name, factory)
}
