# Stops the local B2B-STORE stack.
# - Stops the Node process listening on port 3200 (the B2B app only).
# - Stops the B2B PostgreSQL container b2b-store-postgres (data volume is kept).
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1

$ErrorActionPreference = 'Continue'
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
docker stop b2b-store-postgres | Out-Null
Write-Host 'B2B-STORE stopped. Database volume b2b-store-pgdata is preserved.' -ForegroundColor Green
