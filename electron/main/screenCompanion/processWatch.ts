/**
 * Windows 进程创建/退出事件订阅（WMI）。
 * 使用 WaitForNextEvent（勿用 Register-ObjectEvent 写 Console：子 runspace 常丢输出）。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createInterface } from 'readline'

export type ProcessWatchEvent =
  | { type: 'create'; pid: number; path: string }
  | { type: 'delete'; pid: number; path: string }

export type ProcessWatchHandlers = {
  onEvent: (event: ProcessWatchEvent) => void
  onError?: (detail: string) => void
  onReady?: () => void
}

export type ProcessWatchHandle = {
  stop: () => void
}

/**
 * 同步 WaitForNextEvent + 短超时轮询两个 watcher。
 * WITHIN 2 为 WMI 内部采样；本进程不做 Get-CimInstance 全表枚举。
 */
const WATCH_PS1 = `
$ErrorActionPreference = 'Continue'
$createQuery = 'SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA ''Win32_Process'''
$deleteQuery = 'SELECT * FROM __InstanceDeletionEvent WITHIN 2 WHERE TargetInstance ISA ''Win32_Process'''
$createWatcher = New-Object System.Management.ManagementEventWatcher
$createWatcher.Query = New-Object System.Management.WqlEventQuery $createQuery
$createWatcher.Options.Timeout = [TimeSpan]::FromMilliseconds(500)
$deleteWatcher = New-Object System.Management.ManagementEventWatcher
$deleteWatcher.Query = New-Object System.Management.WqlEventQuery $deleteQuery
$deleteWatcher.Options.Timeout = [TimeSpan]::FromMilliseconds(500)
function Emit-Line([string]$Type, $Target) {
  try {
    $pidVal = [int]$Target.ProcessId
    $pathVal = [string]$Target.ExecutablePath
    if (-not $pathVal) { $pathVal = '' }
    $payload = (@{ t = $Type; pid = $pidVal; path = $pathVal } | ConvertTo-Json -Compress)
    [Console]::Out.WriteLine($payload)
    [Console]::Out.Flush()
  } catch { }
}
$createWatcher.Start()
$deleteWatcher.Start()
[Console]::Out.WriteLine((@{ t = 'ready' } | ConvertTo-Json -Compress))
[Console]::Out.Flush()
try {
  while ($true) {
    try {
      $ev = $createWatcher.WaitForNextEvent()
      if ($ev -and $ev.TargetInstance) { Emit-Line 'create' $ev.TargetInstance }
    } catch [System.Management.ManagementException] { }
    try {
      $ev = $deleteWatcher.WaitForNextEvent()
      if ($ev -and $ev.TargetInstance) { Emit-Line 'delete' $ev.TargetInstance }
    } catch [System.Management.ManagementException] { }
  }
} finally {
  try { $createWatcher.Stop() } catch { }
  try { $deleteWatcher.Stop() } catch { }
  try { $createWatcher.Dispose() } catch { }
  try { $deleteWatcher.Dispose() } catch { }
}
`.trim()

export function startProcessWatch(handlers: ProcessWatchHandlers): ProcessWatchHandle {
  if (process.platform !== 'win32') {
    handlers.onReady?.()
    return { stop: () => undefined }
  }

  let child: ChildProcessWithoutNullStreams | null = null
  let stopped = false
  const scriptPath = join(tmpdir(), 'xue-cyberneko-process-watch.ps1')

  try {
    writeFileSync(scriptPath, WATCH_PS1, 'utf8')
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err.message : String(err))
    return { stop: () => undefined }
  }

  const rl = createInterface({ input: child.stdout })
  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      const raw = JSON.parse(trimmed) as { t?: string; pid?: number; path?: string }
      if (raw.t === 'ready') {
        handlers.onReady?.()
        return
      }
      if (raw.t !== 'create' && raw.t !== 'delete') return
      const pid = typeof raw.pid === 'number' ? raw.pid : Number(raw.pid)
      if (!Number.isFinite(pid)) return
      handlers.onEvent({
        type: raw.t,
        pid,
        path: typeof raw.path === 'string' ? raw.path : ''
      })
    } catch {
      /* ignore */
    }
  })

  child.stderr.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8').trim()
    if (text) handlers.onError?.(text.slice(0, 300))
  })

  child.on('exit', (code) => {
    if (!stopped && code !== 0 && code !== null) {
      handlers.onError?.(`processWatch exited code=${code}`)
    }
  })

  return {
    stop: () => {
      stopped = true
      try {
        rl.close()
      } catch {
        /* ignore */
      }
      if (child && !child.killed) {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
      }
      child = null
    }
  }
}
