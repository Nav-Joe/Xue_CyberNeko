# Kept in sync with embedded script in processWatch.ts (WaitForNextEvent).
# Prefer the embedded copy at runtime.
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
