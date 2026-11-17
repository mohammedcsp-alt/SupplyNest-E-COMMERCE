# Starts the local B2B-STORE stack on Windows 11 (manual start; the supervisor also does this at sign-in).
# - Clears the paused flag, then starts the supervisor, which starts Docker Desktop, the B2B PostgreSQL container
#   (b2b-store-postgres only) and the application on 127.0.0.1:3200.
# - Applies pending migrations first (non-destructive: prisma migrate deploy).
# Usage (from the B2B-STORE folder):  powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$LogDir = Join-Path $root 'storage\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Remove-Item -Path (Join-Path $LogDir 'supervisor.paused') -ErrorAction SilentlyContinue

if (-not (Test-Path (Join-Path $root 'node_modules'))) { npm install }

# Wait for Docker and the database, then apply migrations (non-destructive).
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'b2b-supervisor.ps1') -Once
npx prisma migrate deploy
npx prisma generate | Out-Null

# Hand over to the supervisor (it keeps the stack up from now on). Use the scheduled task if installed.
$task = Get-ScheduledTask -TaskName 'B2B-STORE-Supervisor' -ErrorAction SilentlyContinue
if ($task) {
  Start-ScheduledTask -TaskName 'B2B-STORE-Supervisor'
  Write-Host 'Supervisor task started.' -ForegroundColor Green
} else {
  Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', (Join-Path $PSScriptRoot 'b2b-supervisor.ps1') -WindowStyle Hidden
  Write-Host 'Supervisor started (scheduled task not installed; run install-autostart.ps1 for sign-in startup).' -ForegroundColor Yellow
}
Write-Host 'Give it about 30-60 seconds, then open http://127.0.0.1:3200 (status: powershell -File .\scripts\status-local.ps1).' -ForegroundColor Green
