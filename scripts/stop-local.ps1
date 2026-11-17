# Stops the local B2B-STORE stack and keeps it stopped until start-local.ps1 is run.
# - Creates storage\logs\supervisor.paused so the supervisor and the 5-minute watchdog do not restart anything.
# - Stops the supervisor process (only processes whose command line runs b2b-supervisor.ps1).
# - Stops the Node process listening on port 3200 (the B2B app only).
# - Stops the B2B PostgreSQL container b2b-store-postgres gracefully (data volume b2b-store-pgdata is kept).
# Docker Desktop itself is left running (it may serve other projects).
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $root 'storage\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$DockerExe = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'

# 1. Pause first, so nothing is restarted while we stop things.
Set-Content -Path (Join-Path $LogDir 'supervisor.paused') -Value "paused by stop-local.ps1 at $(Get-Date -Format s)" -Encoding utf8

# 2. Supervisor process(es)
$sups = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'b2b-supervisor' }
foreach ($s in $sups) {
  Write-Host "Stopping supervisor process $($s.ProcessId)"
  Stop-Process -Id $s.ProcessId -Force -ErrorAction SilentlyContinue
}

# 3. Application on 3200 (node only)
$conns = Get-NetTCPConnection -LocalPort 3200 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -match 'node') {
    Write-Host "Stopping node process $($proc.Id) on port 3200"
    Stop-Process -Id $proc.Id -Force
  } else {
    Write-Host "Port 3200 is owned by $($proc.ProcessName); not stopping it." -ForegroundColor Yellow
  }
}

# 4. Database container (graceful stop; only this container)
if (Test-Path $DockerExe) {
  & $DockerExe stop b2b-store-postgres *> $null
  if ($LASTEXITCODE -eq 0) { Write-Host 'Container b2b-store-postgres stopped.' }
  else { Write-Host 'Container b2b-store-postgres was not running or Docker is not reachable.' -ForegroundColor Yellow }
}
Write-Host 'B2B-STORE stopped and paused. Database volume b2b-store-pgdata is preserved.' -ForegroundColor Green
