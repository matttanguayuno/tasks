# AsanaLite Daily Backup Script
# Copies the SQLite database and exports a JSON backup via the API.
# Keeps the last 30 backups; older ones are deleted automatically.

$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backupDir  = Join-Path $projectDir "backups"
$dbFile     = Join-Path $projectDir "dev.db"
$maxBackups = 30

# Create backup folder if it doesn't exist
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"

# --- 1. Copy the raw SQLite database file ---
if (Test-Path $dbFile) {
    $dbBackup = Join-Path $backupDir "dev-db-$timestamp.sqlite"
    Copy-Item $dbFile $dbBackup -Force
    Write-Host "[Backup] Database copied to $dbBackup"
} else {
    Write-Host "[Backup] WARNING: Database file not found at $dbFile"
}

# --- 2. Try JSON export via the running API ---
$jsonBackup = Join-Path $backupDir "tasks-backup-$timestamp.json"
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/backup" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Set-Content -Path $jsonBackup -Value $response.Content -Encoding UTF8
        Write-Host "[Backup] JSON backup saved to $jsonBackup"
    } else {
        Write-Host "[Backup] WARNING: API returned status $($response.StatusCode), skipping JSON backup"
    }
} catch {
    Write-Host "[Backup] INFO: Dev server not running, skipping JSON backup (DB copy was still made)"
}

# --- 3. Prune old backups (keep newest $maxBackups of each type) ---
foreach ($pattern in @("dev-db-*.sqlite", "tasks-backup-*.json")) {
    $files = Get-ChildItem -Path $backupDir -Filter $pattern | Sort-Object LastWriteTime -Descending
    if ($files.Count -gt $maxBackups) {
        $files | Select-Object -Skip $maxBackups | ForEach-Object {
            Remove-Item $_.FullName -Force
            Write-Host "[Backup] Pruned old backup: $($_.Name)"
        }
    }
}

Write-Host "[Backup] Done."
