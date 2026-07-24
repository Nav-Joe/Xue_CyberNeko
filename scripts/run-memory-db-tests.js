/**
 * 记忆库集成测脚手架：
 * 1) 按系统 Node 重编 better-sqlite3（vitest 跑在 Node，不是 Electron）
 * 2) REQUIRE_MEMORY_DB=1 跑 memory 单测（不可用则硬失败，禁止静默 skip）
 * 3) 无论成败，再按 Electron ABI 恢复（避免弄坏桌宠）
 *
 * 用法: npm run test:memory
 */
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')

function runNodeScript(rel, label) {
  console.log(`\n=== ${label} ===`)
  const r = spawnSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: false
  })
  if (r.status !== 0) {
    throw new Error(`${label} failed (exit ${r.status ?? 'null'})`)
  }
}

function runVitestMemory() {
  console.log('\n=== vitest memory (REQUIRE_MEMORY_DB=1) ===')
  const args = [
    'vitest',
    'run',
    'electron/main/memory/__tests__',
    '--reporter=verbose'
  ]
  const r = spawnSync('npx', args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, REQUIRE_MEMORY_DB: '1' },
    shell: true
  })
  if (r.status !== 0) {
    throw new Error(`vitest memory failed (exit ${r.status ?? 'null'})`)
  }
}

function main() {
  let testError = null
  try {
    runNodeScript('scripts/rebuild-native-for-node.js', 'rebuild for Node')
    runVitestMemory()
  } catch (error) {
    testError = error
  } finally {
    try {
      runNodeScript('scripts/rebuild-native-for-electron.js', 'restore Electron ABI')
    } catch (restoreError) {
      console.error(
        '[test:memory] Electron ABI 恢复失败，请手动: npm run rebuild:native',
        restoreError instanceof Error ? restoreError.message : restoreError
      )
      process.exit(1)
    }
  }

  if (testError) {
    console.error(
      '[test:memory] FAILED:',
      testError instanceof Error ? testError.message : testError
    )
    process.exit(1)
  }
  console.log('\n[test:memory] OK — memory DB 集成测已通过，Electron ABI 已恢复')
}

main()
