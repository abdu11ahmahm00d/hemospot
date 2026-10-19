# ============================================================================
# record-demo.ps1 - record the end-to-end demo walkthrough (T-015).
#
# Starts the app's dev server, records the walkthrough with capture-demo.mjs,
# stops the server again and converts the raw capture to an MP4.
#
# Run from anywhere:  powershell -File demo\record-demo.ps1
# ============================================================================

$ErrorActionPreference = "Continue"
$demoDir = $PSScriptRoot
$root = Split-Path -Parent $demoDir
$appDir = Join-Path $root "app"
$outDir = Join-Path $demoDir "video"
$logDir = Join-Path $outDir "logs"
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

function Wait-Http {
  param([string]$Url, [int]$Seconds = 90)
  for ($i = 0; $i -lt [int]($Seconds / 2); $i++) {
    Start-Sleep -Seconds 2
    $code = & curl.exe -s -o NUL -w "%{http_code}" $Url 2>$null
    if ($code -eq "200") { return $true }
  }
  return $false
}

Write-Host "== recording the Hemospot demo walkthrough =="
$vite = $null
if (Wait-Http -Url "http://127.0.0.1:5173" -Seconds 3) {
  Write-Host "dev server already running - using it"
} else {
  Write-Host "starting the dev server..."
  $vite = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173" `
    -WorkingDirectory $appDir -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "vite.log") -RedirectStandardError (Join-Path $logDir "vite.err")
  if (-not (Wait-Http -Url "http://127.0.0.1:5173")) { throw "dev server did not come up" }
  Write-Host "dev server up (pid $($vite.Id))"
}

try {
  Push-Location $demoDir
  & node capture-demo.mjs
  $captureExit = $LASTEXITCODE
  Pop-Location
  if ($captureExit -ne 0) { throw "capture-demo.mjs failed with exit code $captureExit" }
} finally {
  if ($vite) {
    Write-Host "stopping the dev server..."
    try { Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue } catch {}
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match "vite" -and $_.CommandLine -match "5173" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  }
}

$webm = Join-Path $outDir "demo-walkthrough.webm"
$mp4 = Join-Path $outDir "demo-walkthrough.mp4"
if (-not (Test-Path -LiteralPath $webm)) { throw "no capture found at $webm" }

Write-Host "converting to mp4..."
& ffmpeg -y -i $webm -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart $mp4 2>&1 | Select-Object -Last 3
if (-not (Test-Path -LiteralPath $mp4)) { throw "ffmpeg did not produce $mp4" }

$sizeMb = [math]::Round((Get-Item -LiteralPath $mp4).Length / 1MB, 2)
$duration = & ffprobe -v error -show_entries format=duration -of csv=p=0 $mp4 2>$null
Write-Host ""
Write-Host ("video: " + $mp4 + "  (" + $sizeMb + " MB, " + [math]::Round([double]$duration, 1) + "s)")
