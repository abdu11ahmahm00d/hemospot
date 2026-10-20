#requires -Version 5.1
<#
    build-showcase.ps1 - record the product showcase take end to end.

    1. starts the app (vite) and waits for it
    2. drives the browser through the whole workflow while the compositor is
       screencast frame by frame
    3. turns the event log into a sound track
    4. muxes and encodes the final mp4

    The dev server has to live in the same session as the recorder: a server
    started from another shell dies with it (vite exits on EPIPE).

    Usage:
      powershell -NoProfile -ExecutionPolicy Bypass -File build-showcase.ps1
      powershell ... -Tone "polished" -OutDir C:\somewhere
#>

param(
  [string]$AppUrl = "http://localhost:5173",
  [string]$OutDir = "",
  [string]$DemoEmail = "nahin_lead@hemospot.local",
  [switch]$KeepApp
)

$ErrorActionPreference = "Continue"
$demo = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $demo
$app = Join-Path $root "app"

if (-not $OutDir) { $OutDir = Join-Path $demo "showcase-out" }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$rawVideo = Join-Path $OutDir "raw.mp4"
$eventsFile = Join-Path $OutDir "events.json"
$audioFile = Join-Path $OutDir "audio.wav"
$finalVideo = Join-Path $OutDir "showcase.mp4"
foreach ($stale in @($rawVideo, $eventsFile, $audioFile, $finalVideo)) {
  Remove-Item -LiteralPath $stale -Force -ErrorAction SilentlyContinue
}

Write-Host "== 1/4  starting the app ==" -ForegroundColor Cyan
$viteLog = Join-Path $OutDir "vite.log"

# A stale dev server on the port would serve the take while the new one dies
# on "port in use", and a leftover one from an earlier run is worse than none.
foreach ($port in @(5173, 8000)) {
  $stale = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($p in @($stale)) {
    if ($p.OwningProcess) {
      Write-Host ("  clearing port {0} (PID {1})" -f $port, $p.OwningProcess)
      taskkill /PID $p.OwningProcess /T /F 2>&1 | Out-Null
    }
  }
}
Start-Sleep -Seconds 1

# "< nul" gives vite an empty stdin: without it vite's CLI reads the
# console and dies with EPIPE when the wrapper's handle closes.
$proc = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "npm run dev < nul > `"$viteLog`" 2>&1" `
  -WorkingDirectory $app -WindowStyle Hidden -PassThru

$up = $false
for ($i = 0; $i -lt 120; $i++) {
  if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { $up = $true; break }
  Start-Sleep -Milliseconds 500
}
if (-not $up) {
  Write-Host "  the app did not start; see $viteLog" -ForegroundColor Red
  Get-Content -LiteralPath $viteLog -Tail 20 -Encoding UTF8 -ErrorAction SilentlyContinue
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  exit 1
}
Write-Host "  up on $AppUrl"

# The app asks the sidecar whether it is alive; without it the dashboard shows
# a "sidecar unreachable" banner in the recording.
$sidecar = Join-Path $root "sidecar"
$sidecarLog = Join-Path $OutDir "sidecar.log"
$sidecarProc = $null
$health = $null
for ($i = 0; $i -lt 24; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 3
    break
  } catch {
    $health = $null
    if ($i -eq 0) {
      Write-Host "  starting the sidecar" -ForegroundColor Cyan
      $sidecarProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "uvicorn main:app --app-dir app --port 8000 > `"$sidecarLog`" 2>&1" `
        -WorkingDirectory $sidecar -WindowStyle Hidden -PassThru
    }
    Start-Sleep -Seconds 2
  }
}
if ($health) {
  Write-Host ("  sidecar up (model {0})" -f $health.model_version)
} else {
  Write-Host "  the sidecar did not come up - the recording will show its banner" -ForegroundColor Yellow
}

try {
  Write-Host "== 2/4  recording the take ==" -ForegroundColor Cyan
  $env:APP_URL = $AppUrl
  $env:OUT_DIR = $OutDir
  $env:DEMO_EMAIL = $DemoEmail
  Push-Location $demo
  node record-showcase.mjs
  $recordExit = $LASTEXITCODE
  Pop-Location
  Remove-Item Env:APP_URL, Env:OUT_DIR, Env:DEMO_EMAIL -ErrorAction SilentlyContinue
  if ($recordExit -ne 0) { Write-Host "  the recorder exited with $recordExit" -ForegroundColor Yellow }
  $captured = @(Get-ChildItem -LiteralPath (Join-Path $OutDir "frames") -Filter "*.jpg" -ErrorAction SilentlyContinue).Count
  if ($captured -lt 1) {
    Write-Host "  no frames captured - the recording failed" -ForegroundColor Red
    exit 1
  }
  Write-Host ("  captured {0} frames" -f $captured)

  Write-Host "== 3/4  building the sound track ==" -ForegroundColor Cyan
  python (Join-Path $demo "showcase-audio.py") $eventsFile $audioFile
  if (-not (Test-Path -LiteralPath $audioFile)) {
    Write-Host "  no audio - continuing without it" -ForegroundColor Yellow
  }

  Write-Host "== 4/4  encoding the deliverable ==" -ForegroundColor Cyan
  $frames = Join-Path $OutDir "frames"
  $frameCount = @(Get-ChildItem -LiteralPath $frames -Filter "*.jpg" -ErrorAction SilentlyContinue).Count
  if ($frameCount -lt 1) {
    Write-Host "  no frames captured - the recording failed" -ForegroundColor Red
    exit 1
  }
  # the frames are the record; the encode happens here, off the critical path
  & ffmpeg -y -framerate 30 -i (Join-Path $frames "f%06d.jpg") `
    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p $rawVideo 2>&1 | Out-Null
  if (-not (Test-Path -LiteralPath $rawVideo)) {
    Write-Host "  the frame encode failed" -ForegroundColor Red
    exit 1
  }
  Write-Host ("  encoded {0} frames -> raw {1:N1} MB" -f $frameCount, ((Get-Item -LiteralPath $rawVideo).Length / 1MB))
  if (Test-Path -LiteralPath $audioFile) {
    & ffmpeg -y -i $rawVideo -i $audioFile `
      -map 0:v:0 -map 1:a:0 `
      -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p `
      -c:a aac -b:a 160k -ar 48000 -ac 2 `
      -movflags +faststart -shortest $finalVideo 2>&1 | Out-Null
  } else {
    & ffmpeg -y -i $rawVideo `
      -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p `
      -movflags +faststart $finalVideo 2>&1 | Out-Null
  }
}
finally {
  if (-not $KeepApp) {
    taskkill /PID $proc.Id /T /F 2>&1 | Out-Null
  }
  if ($sidecarProc) {
    taskkill /PID $sidecarProc.Id /T /F 2>&1 | Out-Null
  }
}

if (Test-Path -LiteralPath $finalVideo) {
  $size = (Get-Item -LiteralPath $finalVideo).Length / 1MB
  $probe = & ffprobe -v error -show_entries format=duration -show_entries stream=width,height,r_frame_rate -of default=noprint_wrappers=1 $finalVideo 2>$null
  Write-Host ""
  Write-Host ("  showcase.mp4  {0:N1} MB" -f $size) -ForegroundColor Green
  $probe | ForEach-Object { "  $_" }
} else {
  Write-Host "  encoding failed" -ForegroundColor Red
  exit 1
}
