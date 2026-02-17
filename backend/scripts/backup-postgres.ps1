# backend/scripts/backup-postgres.ps1
param(
  [string]$OutDir = "C:\pharma\backups\db",
  [int]$KeepDays = 14
)

if (-not $env:DATABASE_URL) { Write-Host "ERROR: DATABASE_URL not set."; exit 2 }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$file = Join-Path $OutDir ("pharma_" + $stamp + ".dump")

Write-Host "Running pg_dump to $file"
pg_dump -Fc "$env:DATABASE_URL" -f "$file"
if ($LASTEXITCODE -ne 0) { Write-Host "pg_dump failed"; exit 1 }

$cutoff = (Get-Date).AddDays(-$KeepDays)
Get-ChildItem -Path $OutDir -Filter "*.dump" | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item -Force
Write-Host "Backup OK"
exit 0
