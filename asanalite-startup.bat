@echo off
cd /d C:\Users\matt\Documents\AsanaLite

echo === Running pre-startup database backup ===
powershell -ExecutionPolicy Bypass -File scripts\daily-backup.ps1
echo ============================================

npm run dev