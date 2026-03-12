# Register a Windows Task Scheduler task for daily AsanaLite backups.
# Run this script ONCE (as Administrator or current user) to set it up.

$taskName   = "AsanaLite Daily Backup"
$scriptPath = Join-Path $PSScriptRoot "daily-backup.ps1"
$trigger    = New-ScheduledTaskTrigger -Daily -At "12:00PM"
$action     = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$settings   = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

# Register for current user (no admin required)
Register-ScheduledTask `
    -TaskName $taskName `
    -Trigger $trigger `
    -Action $action `
    -Settings $settings `
    -Description "Backs up AsanaLite SQLite database and JSON export daily at noon." `
    -Force

Write-Host "Scheduled task '$taskName' registered successfully."
Write-Host "It will run daily at 12:00 PM. Edit in Task Scheduler if you want a different time."
