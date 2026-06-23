/**
 * 单实例锁：供 启动.bat 与 Electron 主进程共用。
 * .runtime/app-instance.lock 存 { pid, startedAt, role }
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const LOCK_PATH = path.join(ROOT, '.runtime', 'app-instance.lock')
const STALE_LAUNCH_MS = 120_000

function ensureRuntimeDir() {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true })
}

function readLock() {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf8')
    const data = JSON.parse(raw)
    if (typeof data?.pid === 'number' && data.pid > 0) {
      return data
    }
  } catch {
    // ignore
  }
  return null
}

function pidAlive(pid) {
  if (!pid || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isLockActive(lock) {
  if (!lock) {
    return false
  }
  if (pidAlive(lock.pid)) {
    return true
  }
  if (lock.role === 'launching') {
    const startedAt = Date.parse(lock.startedAt || '')
    if (Number.isFinite(startedAt) && Date.now() - startedAt < STALE_LAUNCH_MS) {
      return true
    }
  }
  return false
}

function isAppRunning() {
  return isLockActive(readLock())
}

function writeLock(pid, role = 'app') {
  ensureRuntimeDir()
  fs.writeFileSync(
    LOCK_PATH,
    `${JSON.stringify({ pid, role, startedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  )
}

function clearLock(expectedPid) {
  const lock = readLock()
  if (!lock) {
    return
  }
  if (expectedPid !== undefined && lock.pid !== expectedPid) {
    return
  }
  try {
    fs.unlinkSync(LOCK_PATH)
  } catch {
    // ignore
  }
}

function findProjectElectronPids() {
  if (process.platform !== 'win32') {
    return []
  }
  const rootLower = ROOT.toLowerCase().replace(/\//g, '\\')
  try {
    const { execFileSync } = require('child_process')
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | ForEach-Object { \"$($_.ProcessId),$($_.CommandLine)\" }"
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
        maxBuffer: 10 * 1024 * 1024
      }
    )
    const pids = []
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) {
        continue
      }
      const lower = line.toLowerCase()
      if (
        !lower.includes('xue_cyberneko') &&
        !lower.includes('xue-cyber-neko') &&
        !lower.includes(rootLower) &&
        !lower.includes('electron-vite')
      ) {
        continue
      }
      const comma = line.indexOf(',')
      if (comma <= 0) {
        continue
      }
      const pid = parseInt(line.slice(0, comma), 10)
      if (Number.isFinite(pid) && pid > 0) {
        pids.push(pid)
      }
    }
    return pids
  } catch {
    return []
  }
}

function isAppRunningStrict() {
  if (isAppRunning()) {
    return true
  }
  return findProjectElectronPids().length > 0
}

module.exports = {
  LOCK_PATH,
  readLock,
  isAppRunning,
  isAppRunningStrict,
  writeLock,
  clearLock,
  pidAlive
}

if (require.main === module) {
  const cmd = process.argv[2]
  if (cmd === 'check') {
    process.exit(isAppRunningStrict() ? 2 : 0)
  }
  if (cmd === 'launching') {
    writeLock(process.pid, 'launching')
    process.exit(0)
  }
  if (cmd === 'clear') {
    clearLock()
    process.exit(0)
  }
  console.error('Usage: node app-instance-lock.js check|launching|clear')
  process.exit(1)
}
