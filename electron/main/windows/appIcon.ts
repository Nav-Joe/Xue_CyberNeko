import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 窗口 / 任务栏图标。产物在 out/main/assets；开发测走仓库源路径。
 * 找不到则 undefined，Electron 回退默认图标。
 */
export function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(__dirname, 'assets', 'app-icon.png'),
    join(__dirname, 'windows', 'assets', 'app-icon.png'),
    join(process.cwd(), 'electron', 'main', 'windows', 'assets', 'app-icon.png')
  ]
  return candidates.find((path) => existsSync(path))
}
