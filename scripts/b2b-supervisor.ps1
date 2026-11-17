# B2B-STORE supervisor (Windows 11, per-user).
#
# Keeps the local stack running without Claude Code, VS Code or any terminal being open:
#   1. Docker Desktop engine          (started if not running; waited on up to 180 s)
#   2. PostgreSQL container           b2b-store-postgres ONLY (started if stopped; pg_isready checked)
#   3. Application on 127.0.0.1:3200  (started after the DB is ready; restarted after 3 failed /api/health probes)
#
# It never recreates or resets containers, never deletes volumes, never runs migrations and never touches the WMS
# containers (wms-platform-*). It only starts what is stopped. Schema migrations stay a manual step (see OPERATIONS.md).
#
# Started by the scheduled task installed with scripts\install-autostart.ps1 (at sign-in, plus a 5-minute watchdog).
# Only one instance runs at a time (named mutex). The file storage\logs\supervisor.paused stops it from restarting
# anything: scripts\stop-local.ps1 creates it and scripts\start-local.ps1 removes it.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\b2b-supervisor.ps1            # run forever (dev server, the default)
#   powershell -ExecutionPolicy Bypass -File .\scripts\b2b-supervisor.ps1 -Mode prod # production build (see note)
#   powershell -ExecutionPolicy Bypass -File .\scripts\b2b-supervisor.ps1 -Once      # one pass, then exit (tests)
#
# Note: 'prod' refuses to start while OTP_PROVIDER=mock (src/instrumentation.ts guard), and mock OTP is the
# documented local-development setting. So the default is 'dev', which is what README.md documents for this build.

param(
  [ValidateSet('prod', 'dev')] [string]$Mode = 'dev',
  [switch]$Once,
  [int]$IntervalSeconds = 30
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$Container = 'b2b-store-postgres'
$DbUser = 'b2b_app'
$DbName = 'b2b_store_dev'
$Port = 3200
$AppUrl = "http://127.0.0.1:$Port"
$DockerExe = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
$DockerDesktopExe = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'
$LogDir = Join-Path $root 'storage\logs'
$LogFile = Join-Path $LogDir 'supervisor.log'
$PausedFlag = Join-Path $LogDir 'supervisor.paused'
$AppOut = Join-Path $LogDir 'app.out.log'
$AppErr = Join-Path $LogDir 'app.err.log'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log([string]$msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

# Single instance: if another supervisor holds the mutex this run exits quietly (the watchdog starts us every 5 min).
$mutex = New-Object System.Threading.Mutex($false, 'Local\B2BStoreSupervisor')
$hasLock = $false
try { $hasLock = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $hasLock = $true }
if (-not $hasLock) { exit 0 }

function Invoke-Docker([string[]]$Arguments) {
  $out = & $DockerExe @Arguments 2>&1 | ForEach-Object { "$_" }
  return [pscustomobject]@{ Code = $LASTEXITCODE; Output = ($out -join "`n") }
}

function Test-DockerEngine {
  if (-not (Test-Path $DockerExe)) { return $false }
  return ((Invoke-Docker @('info', '--format', '{{.ServerVersion}}')).Code -eq 0)
}

function Ensure-DockerEngine {
  if (Test-DockerEngine) { return $true }
  if (-not (Test-Path $DockerDesktopExe)) { Write-Log 'ERROR Docker Desktop not found at the expected path.'; return $false }
  if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    Write-Log 'Starting Docker Desktop.'
    Start-Process -FilePath $DockerDesktopExe
  }
  for ($i = 0; $i -lt 36; $i++) {
    Start-Sleep -Seconds 5
    if (Test-DockerEngine) { Write-Log "Docker engine ready after $(($i + 1) * 5) s."; return $true }
  }
  Write-Log 'WARN Docker engine did not become ready within 180 s; will retry on the next pass.'
  return $false
}

function Ensure-Database {
  $state = Invoke-Docker @('inspect', '-f', '{{.State.Running}}', $Container)
  if ($state.Code -ne 0) {
    Write-Log "ERROR Container $Container does not exist. Create it first (README, Database section). Nothing was changed."
    return $false
  }
  if ($state.Output.Trim() -ne 'true') {
    Write-Log "Starting container $Container (existing volume kept)."
    $r = Invoke-Docker @('start', $Container)
    if ($r.Code -ne 0) { Write-Log "ERROR docker start failed: $($r.Output)"; return $false }
  }
  # Come back automatically after a Docker restart. 'docker update' changes only the restart policy.
  $policy = (Invoke-Docker @('inspect', '-f', '{{.HostConfig.RestartPolicy.Name}}', $Container)).Output.Trim()
  if ($policy -ne 'unless-stopped') {
    [void](Invoke-Docker @('update', '--restart', 'unless-stopped', $Container))
    Write-Log "Restart policy of $Container set to unless-stopped (was '$policy')."
  }
  return ((Invoke-Docker @('exec', $Container, 'pg_isready', '-U', $DbUser, '-d', $DbName)).Code -eq 0)
}

function Get-AppListener {
  return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Test-AppHealthy {
  try {
    $r = Invoke-WebRequest -Uri "$AppUrl/api/health" -UseBasicParsing -TimeoutSec 15
    return @{ Up = $true; Code = [int]$r.StatusCode }
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    return @{ Up = $false; Code = $code }
  }
}

function Start-App {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { Write-Log 'ERROR node.exe not found on PATH; app not started.'; return }
  if ($Mode -eq 'prod' -and -not (Test-Path (Join-Path $root '.next\BUILD_ID'))) {
    Write-Log 'No production build found; running npm run build (this can take a few minutes).'
    & npm run build 2>&1 | ForEach-Object { Add-Content -Path $LogFile -Value "$_" -Encoding utf8 }
    if (-not (Test-Path (Join-Path $root '.next\BUILD_ID'))) { Write-Log 'ERROR build failed; app not started.'; return }
  }
  # .env sets NODE_ENV=development. Process environment takes precedence over .env, so the child gets the right mode.
  $nodeEnv = if ($Mode -eq 'prod') { 'production' } else { 'development' }
  $nodeArgs = if ($Mode -eq 'prod') { @('server.mjs') } else { @('server.mjs', '--dev') }
  Write-Log "Starting application ($Mode) on $AppUrl."
  $previous = $env:NODE_ENV
  $env:NODE_ENV = $nodeEnv
  try {
    [void](Start-Process -FilePath $node -ArgumentList $nodeArgs -WorkingDirectory $root -WindowStyle Hidden `
      -RedirectStandardOutput $AppOut -RedirectStandardError $AppErr -PassThru)
  } finally {
    $env:NODE_ENV = $previous
  }
}

function Stop-AppListener {
  $l = Get-AppListener
  if ($l) {
    $p = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -match 'node') {
      Write-Log "Stopping unresponsive node process $($p.Id)."
      Stop-Process -Id $p.Id -Force
    }
  }
}

$appFailures = 0
Write-Log "Supervisor started (mode=$Mode, once=$Once, pid=$PID)."

do {
  if (Test-Path $PausedFlag) {
    Write-Log 'Paused (storage\logs\supervisor.paused present). Exiting.'
    break
  }

  $engineOk = Ensure-DockerEngine
  $dbOk = $false
  if ($engineOk) { $dbOk = Ensure-Database }

  if ($dbOk) {
    if (-not (Get-AppListener)) {
      Start-App
      $appFailures = 0
      Start-Sleep -Seconds 20
    } else {
      $h = Test-AppHealthy
      if ($h.Up) {
        $appFailures = 0
      } else {
        $appFailures++
        Write-Log "WARN app did not answer /api/health (HTTP $($h.Code)); failure $appFailures of 3."
        if ($appFailures -ge 3) {
          Stop-AppListener
          Start-Sleep -Seconds 3
          Start-App
          $appFailures = 0
          Start-Sleep -Seconds 20
        }
      }
    }
  } else {
    Write-Log "WARN database not ready (engine=$engineOk); application left as is."
  }

  if ($Once) { break }
  Start-Sleep -Seconds $IntervalSeconds
} while ($true)

if ($hasLock) { $mutex.ReleaseMutex() }
