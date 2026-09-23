# Smoke-test the electron-builder unpacked Windows app on CI (or locally after desktop:pack).
# Fails closed: non-zero exit if Plasma does not serve /api/config with HTTP 200 in time.

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = Join-Path $repoRoot 'release\win-unpacked\Plasma.exe'
$healthUrl = 'http://127.0.0.1:3847/api/config'
$timeoutSec = 120
$pollSec = 2

if (-not (Test-Path -LiteralPath $exe)) {
  Write-Error "Packaged executable not found: $exe (run npm run desktop:pack first)"
}

Write-Host "Smoke: starting $exe"
$env:ELECTRON_ENABLE_LOGGING = '1'

$proc = Start-Process `
  -FilePath $exe `
  -ArgumentList @('--disable-gpu', '--no-sandbox') `
  -PassThru `
  -WorkingDirectory (Split-Path -Parent $exe)

if (-not $proc) {
  Write-Error 'Failed to start Plasma.exe'
}

$deadline = (Get-Date).AddSeconds($timeoutSec)
$ok = $false

try {
  while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) {
      Write-Error "Plasma exited early with code $($proc.ExitCode) before health check passed"
    }

    try {
      $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
      if ($resp.StatusCode -eq 200) {
        Write-Host "Smoke: health OK ($healthUrl)"
        $ok = $true
        break
      }
      Write-Host "Smoke: unexpected status $($resp.StatusCode), retrying..."
    } catch {
      Write-Host "Smoke: waiting for server ($($_.Exception.Message))"
    }

    Start-Sleep -Seconds $pollSec
  }

  if (-not $ok) {
    Write-Error "Timed out after ${timeoutSec}s waiting for $healthUrl"
  }
} finally {
  Write-Host 'Smoke: stopping Plasma'
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    $proc.WaitForExit(15000) | Out-Null
  }
  # Cleanup stray child processes (Electron sometimes spawns helpers)
  Get-Process -Name 'Plasma' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host 'Smoke: passed'
exit 0
