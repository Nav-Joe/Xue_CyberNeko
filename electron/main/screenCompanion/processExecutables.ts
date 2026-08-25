/**
 * 枚举本机进程可执行文件路径（Windows；可注入供单测）。
 * 注意：PowerShell 脚本避免使用 $_，防止外层壳把 $ 吃掉导致枚举为空。
 */
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** 从一行一个路径的文本中过滤空行与表头 */
export function parseProcessPathLines(stdout: string): string[] {
  const paths: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const p = line.trim().replace(/^"|"$/g, '')
    if (!p) continue
    if (p.toLowerCase() === 'executablepath') continue
    paths.push(p)
  }
  return paths
}

/** 不使用 $_ / $null，避免外层 PowerShell 吞掉 $ 变量导致枚举为空 */
export const WIN_PROCESS_PATH_PS =
  'Get-CimInstance Win32_Process | Select-Object -ExpandProperty ExecutablePath'

export async function listProcessExecutablePaths(): Promise<string[]> {
  if (process.platform !== 'win32') return []

  try {
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_PROCESS_PATH_PS],
      { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 }
    )
    const paths = parseProcessPathLines(stdout)
    if (paths.length > 0) return paths
    // 若 stdout 空但 stderr 有内容，仍返回空（调用方当未命中）
    void stderr
    return []
  } catch {
    return []
  }
}
