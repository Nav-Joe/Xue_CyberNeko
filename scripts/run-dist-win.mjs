/**
 * 打 Windows 安装包。XUE_PACK_INSTALLER=1 让本机试验代码不进产物。
 * Vite 会把 public/ 整份拷进 out/renderer，其中包括本机模型，打包前删掉。
 * 传入 --dir 时只生成未压缩的程序目录，用来看装出来的结构。
 */
import { spawnSync } from 'child_process'
import { rmSync } from 'fs'
import { join } from 'path'

const env = { ...process.env, XUE_PACK_INSTALLER: '1' }

function run(command, args) {
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/c', command, ...args], { stdio: 'inherit', env, cwd: process.cwd() })
      : spawnSync(command, args, { stdio: 'inherit', env, cwd: process.cwd() })
  if (result.status !== 0) {
    if (result.error) console.error(result.error)
    process.exit(result.status ?? 1)
  }
}

rmSync('out', { recursive: true, force: true })
run('npm', ['run', 'build'])
run('node', ['scripts/stage-installer-payload.mjs'])
rmSync(join('out', 'renderer', 'models'), { recursive: true, force: true })

const dirOnly = process.argv.includes('--dir')
run('npx', dirOnly ? ['electron-builder', '--win', 'dir'] : ['electron-builder', '--win', 'nsis'])
