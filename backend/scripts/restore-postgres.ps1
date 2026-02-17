# backend/scripts/restore-postgres.ps1
param([Parameter(Mandatory=$true)][string]$DumpFile)

if (-not (Test-Path $DumpFile)) { Write-Host "Dump file not found: $DumpFile"; exit 2 }
if (-not $env:DATABASE_URL) { Write-Host "ERROR: DATABASE_URL not set."; exit 2 }

Write-Host "Restoring $DumpFile into DATABASE_URL (ensure this is STAGING)"
pg_restore -d "$env:DATABASE_URL" "$DumpFile"
if ($LASTEXITCODE -ne 0) { Write-Host "pg_restore failed"; exit 1 }

Write-Host "Restore OK"
exit 0
