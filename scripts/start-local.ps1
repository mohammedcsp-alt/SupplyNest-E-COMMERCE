# Starts the local B2B-STORE stack on Windows 11.
# - Starts ONLY the B2B PostgreSQL container (b2b-store-postgres). Never touches WMS containers.
# - Applies pending migrations (non-destructive) and starts the app on 127.0.0.1:3200.
# Usage (from the B2B-STORE folder):  powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$container = 'b2b-store-postgres'
$exists = docker ps -a --filter "name=^/$container$" --format '{{.Names}}'
if (-not $exists) {
  Write-Host "Container $container not found. Create it first (see README.md section 'Database')." -ForegroundColor Red
  exit 1
}
docker start $container | Out-Null

# wait for PostgreSQL to accept connections on the B2B port only
for ($i = 0; $i -lt 30; $i++) {
  docker exec $container pg_isready -U b2b_app -d b2b_store_dev *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) { npm install }
npx prisma migrate deploy
npx prisma generate | Out-Null

$port = 3200
$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "Port $port is already in use. Stop the other process first." -ForegroundColor Yellow
  exit 1
}
Write-Host "Starting B2B-STORE on http://127.0.0.1:$port (Ctrl+C to stop)" -ForegroundColor Green
npm run dev
