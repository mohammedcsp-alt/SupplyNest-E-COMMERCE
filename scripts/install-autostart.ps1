# Registers (or removes) the Windows scheduled task that keeps B2B-STORE running for the current user.
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1               # install / update
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1 -Uninstall     # remove the task only
#
# The task "B2B-STORE-Supervisor" runs scripts\b2b-supervisor.ps1:
#   - at every sign-in of this user, and
#   - every 5 minutes as a watchdog (if the supervisor died, the next run starts it again; a running supervisor makes
#     the extra runs exit immediately because of its named mutex).
# It runs only in your interactive session (needed for Docker Desktop), with normal user rights (no administrator
# prompt). It is not affected by closing Claude Code or VS Code. It does NOT run before you sign in to Windows.

param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$TaskName = 'B2B-STORE-Supervisor'
$root = Split-Path -Parent $PSScriptRoot
$supervisor = Join-Path $root 'scripts\b2b-supervisor.ps1'
$user = "$env:USERDOMAIN\$env:USERNAME"

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Scheduled task '$TaskName' removed. The database and application were not touched." -ForegroundColor Yellow
  } else {
    Write-Host "Scheduled task '$TaskName' is not installed." -ForegroundColor Yellow
  }
  exit 0
}

if (-not (Test-Path $supervisor)) { throw "Supervisor script not found: $supervisor" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisor`"" `
  -WorkingDirectory $root
$triggers = @(
  (New-ScheduledTaskTrigger -AtLogOn -User $user),
  (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650))
)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
$description = 'Keeps the B2B-STORE database container and local website running (see OPERATIONS.md, section 8).'

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Principal $principal `
  -Settings $settings -Description $description -Force | Out-Null

Write-Host "Scheduled task '$TaskName' installed for $user." -ForegroundColor Green
Write-Host 'It starts at your next sign-in and every 5 minutes as a watchdog.'
Write-Host "To start it now:  Start-ScheduledTask -TaskName '$TaskName'"
