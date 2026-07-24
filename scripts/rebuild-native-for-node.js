/**
 * 将 better-sqlite3 按当前系统 Node ABI 重编，供 vitest 在 Node 下打开 memory.db。
 * 测完请再跑 rebuild:native，否则桌宠主进程会因 ABI 对不上而无法加载记忆库。
 */
const { execSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')

function main() {
  console.log(
    `[rebuild:native:node] Node ${process.version} MODULE_VERSION=${process.versions.modules} → better-sqlite3`
  )
  try {
    execSync('npm rebuild better-sqlite3', {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: true
    })
    // 冒烟：能 new Database 才算成功
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    console.log('[rebuild:native:node] better-sqlite3 已对齐系统 Node')
  } catch (error) {
    console.error(
      '[rebuild:native:node] 失败:',
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }
}

main()
