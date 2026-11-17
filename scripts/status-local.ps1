# Read-only status report for the local B2B-STORE stack. Changes nothing.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\status-local.ps1

$root = Split-Path -Parent $PSScriptRoot
$DockerExe = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
$Container = 'b2b-store-postgres'
$LogDir = Join-Path $root 'storage\logs'

function Show([string]$label, [string]$value) { '{0,-28} {1}' -f ($label + ':'), $value }

# Docker engine
$engine = 'DOWN'
if (Test-Path $DockerExe) {
  & $DockerExe info --format '{{.ServerVersion}}' *> $null
  if ($LASTEXITCODE -eq 0) { $engine = 'UP' }
}
Show 'Docker engine' $engine

# Database container and health
$state = 'n/a'; $restart = 'n/a'; $pg = 'n/a'
if ($engine -eq 'UP') {
  $state = (& $DockerExe inspect -f '{{.State.Status}}' $Container 2>$null) -join ''
  $restart = (& $DockerExe inspect -f '{{.HostConfig.RestartPolicy.Name}}' $Container 2>$null) -join ''
  if ($state -eq 'running') {
    & $DockerExe exec $Container pg_isready -U b2b_app -d b2b_store_dev *> $null
    $pg = if ($LASTEXITCODE -eq 0) { 'accepting connections' } else { 'NOT accepting connections' }
  }
}
Show 'DB container' "$Container ($state, restart=$restart)"
Show 'PostgreSQL' $pg

# Application
$app = 'DOWN'; $appCode = ''
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3200/api/health' -UseBasicParsing -TimeoutSec 15
  $app = 'UP'; $appCode = "HTTP $([int]$r.StatusCode)"
} catch {
  if ($_.Exception.Response) { $appCode = "HTTP $([int]$_.Exception.Response.StatusCode)" } else { $appCode = 'no response' }
}
Show 'Website http://127.0.0.1:3200' "$app ($appCode)"

# Supervisor and scheduled task
$sup = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'b2b-supervisor' }
Show 'Supervisor process' $(if ($sup) { "running (pid $(@($sup)[0].ProcessId))" } else { 'not running' })
$task = Get-ScheduledTask -TaskName 'B2B-STORE-Supervisor' -ErrorAction SilentlyContinue
Show 'Scheduled task' $(if ($task) { "installed ($($task.State))" } else { 'NOT installed (run install-autostart.ps1)' })
Show 'Paused flag' $(if (Test-Path (Join-Path $LogDir 'supervisor.paused')) { 'SET (automatic restart disabled)' } else { 'clear' })
Show 'Supervisor log' (Join-Path $LogDir 'supervisor.log')
