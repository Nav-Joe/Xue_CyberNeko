/**
 * 将 better-sqlite3 等原生模块按当前 Electron ABI 重编。
 * 系统 Node（如 v24 / MODULE 137）与 Electron 34（MODULE 132）不一致时，
 * 普通 npm install 编出的 .node 无法在桌宠主进程加载。
 */
const { execSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')

function main() {
  if (process.env.ELECTRON_SKIP_NATIVE_REBUILD === '1') {
    console.log('[postinstall] 跳过 native rebuild（ELECTRON_SKIP_NATIVE_REBUILD=1）')
    return
  }

  console.log('[postinstall] 正在按 Electron ABI 重编 better-sqlite3…')
  try {
    execSync('npx electron-rebuild -f -w better-sqlite3', {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: true
    })
    console.log('[postinstall] better-sqlite3 已对齐 Electron')
  } catch (error) {
    console.error('[postinstall] better-sqlite3 重编失败:', error instanceof Error ? error.message : error)
    console.error('请手动执行: npm run rebuild:native')
    process.exit(1)
  }
}

main()
