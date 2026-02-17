# backend/scripts/monitor-ready.ps1
# Windows Task Scheduler friendly readiness ping + rolling log.
param(
  [string]$Url = "http://localhost:3000/health/ready",
  [string]$LogDir = "C:\pharma\backups\monitor",
  [int]$TimeoutSec = 10
)

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd"
$logFile = Join-Path $LogDir ("ready_" + $stamp + ".log")

try {
  $r = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec $TimeoutSec
  if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) {
    Add-Content -Path $logFile -Value ("OK " + (Get-Date).ToString("s") + " " + $r.Content)
    exit 0
  } else {
    Add-Content -Path $logFile -Value ("FAIL " + (Get-Date).ToString("s") + " " + $r.StatusCode + " " + $r.Content)
    exit 1
  }
} catch {
  Add-Content -Path $logFile -Value ("FAIL " + (Get-Date).ToString("s") + " " + $_.Exception.Message)
  exit 1
}
