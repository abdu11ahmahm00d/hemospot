# ============================================================================
# engine-drills.ps1 - T-016, the engine-side NFR drills (NFR1.3, 1.4, 1.5,
# 1.6, 1.7). Companion to rbac-matrix.ps1 (which covers 1.1 / 1.2 / 1.5-RLS).
#
# What this script does, in order:
#   1. Applies the standard VERIFY- scenario fixtures (idempotent).
#   2. NFR1.3 - samples POST /analyze latency three times and logs every
#      timing_ms against the 5000 ms budget.
#   3. NFR1.6/1.7 - analyzes a blank image; expects verdict "inconclusive"
#      with an explanation, never a bare label. Then asserts the DB invariant:
#      no definitive verdict and no ready_for_review row is ever missing its
#      confidence / explanation.
#   4. NFR1.5 - the hash chain end to end: file, evidence row, downloaded
#      bytes, and the immutability of the drill object (upload exists only
#      once, by design).
#   5. NFR1.4 - the kill-test, with real processes and real time:
#        phase A: start worker.py pointed at a black-hole socket (accepts the
#                 connection, never answers), wait for the claim, kill -Force
#                 mid-job, prove the job is still 'processing' (not lost).
#        wait 65 real seconds.
#        phase B: start a second worker with STALE_MINUTES=1; it must re-queue
#                 the stale claim, run the job to completion, and fill every
#                 result field.
#
# Usage (from anywhere):
#   powershell -File verification\engine-drills.ps1
#
# Needs: sidecar\.env, a logged-in Supabase CLI token, python on PATH with the
# sidecar requirements installed (no venv assumed), curl.exe.
# ============================================================================

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$verification = $PSScriptRoot
$resultsDir = Join-Path $verification "results"
if (-not (Test-Path -LiteralPath $resultsDir)) { New-Item -ItemType Directory -Path $resultsDir | Out-Null }

. "$PSScriptRoot\nfr-lib.ps1"
$H = Get-HemospotEnv -RepoRoot $root
$SUPABASE_URL = $H.url

$sidecarDir = Join-Path $root "sidecar"
$sidecarUrl = "http://127.0.0.1:8000"
$patternPath = Join-Path $root "sidecar\app\smoke_pattern.png"
$patternSha = (Get-FileHash -LiteralPath $patternPath -Algorithm SHA256).Hash.ToLower()
$patternSize = (Get-Item -LiteralPath $patternPath).Length

# Scenario fixture ids (fixed in scenario.sql).
$CASE_O = "00000000-0000-4000-8000-000000000001"
$EV_O   = "00000000-0000-4000-8000-000000000004"

$failures = @()
function Check {
  param([string]$Name, [bool]$Ok, [string]$Detail)
  $script:checks += [pscustomobject]@{ name = $Name; ok = $Ok; detail = $Detail }
  if (-not $Ok) { $script:failures += "$Name - $Detail" }
}
$checks = @()

# ------------------------------------------------------------ preflight -----
Write-Host "== Hemospot engine drills (T-016) =="
Write-Host "project: $($H.ref)"
$lead = Get-PersonaToken -Env $H -Email "nahin_lead@hemospot.local"
$analyst = Get-PersonaToken -Env $H -Email "firman@hemospot.local"
$ANON = $H.anon
$leadH = @{ apikey = $ANON; Authorization = "Bearer $($lead.token)"; Prefer = "return=representation" }
$analystH = @{ apikey = $ANON; Authorization = "Bearer $($analyst.token)"; Prefer = "return=representation" }

# scenario fixtures
$scenario = [System.IO.File]::ReadAllText((Join-Path $verification "scenario.sql"))
$scenario = $scenario.Replace('__PATTERN_SHA256__', $patternSha).Replace('__PATTERN_SIZE__', [string]$patternSize)
$setup = Invoke-ManagementSql -Env $H -Sql $scenario
if ($setup.status -ge 400) { throw "scenario apply failed (HTTP $($setup.status)): $($setup.body)" }
Write-Host "scenario applied"

# sidecar up? (start it if not; remember whether we did)
$startedSidecar = $false
$sidecarProc = $null
$health = Invoke-Http -Method GET -Url "$sidecarUrl/health"
if ($health.status -ne 200) {
  Write-Host "sidecar not running - starting uvicorn..."
  $sidecarProc = Start-Process -FilePath "python" -ArgumentList "-m", "uvicorn", "main:app", "--app-dir", "app", "--port", "8000" `
    -WorkingDirectory $sidecarDir -PassThru `
    -RedirectStandardOutput (Join-Path $resultsDir "sidecar-drill.log") `
    -RedirectStandardError (Join-Path $resultsDir "sidecar-drill.err")
  $startedSidecar = $true
  $up = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 1500
    $health = Invoke-Http -Method GET -Url "$sidecarUrl/health"
    if ($health.status -eq 200) { $up = $true; break }
  }
  if (-not $up) { throw "sidecar failed to come up within 60s" }
}
Write-Host "sidecar healthy: $($health.body)"

function Invoke-Analyze {
  param([string]$ImagePath)
  $raw = (& curl.exe -s -X POST "$sidecarUrl/analyze" -F "image=@$ImagePath;type=image/png" -w "|HTTPSTATUS:%{http_code}" 2>$null) -join "`n"
  $marker = $raw.LastIndexOf('|HTTPSTATUS:')
  $status = 0; $text = $raw
  if ($marker -ge 0) { $status = [int]$raw.Substring($marker + 12); $text = $raw.Substring(0, $marker) }
  $json = $null
  if ($status -eq 200) { $json = $text | ConvertFrom-Json }
  return @{ status = $status; json = $json; body = $text }
}

# ------------------------------------------------------ NFR1.3 latency ------
Write-Host ""
Write-Host "-- NFR1.3: latency samples (budget 5000 ms)"
$latencies = @()
for ($i = 1; $i -le 3; $i++) {
  $r = Invoke-Analyze -ImagePath $patternPath
  if ($r.status -ne 200) { Check "NFR1.3 sample $i reachable" $false "HTTP $($r.status)"; continue }
  $latencies += [double]$r.json.timing_ms
  Write-Host ("   sample {0}: {1} ms (verdict {2})" -f $i, $r.json.timing_ms, $r.json.verdict)
}
foreach ($lat in $latencies) { Check "NFR1.3 ${lat}ms within budget" ($lat -lt 5000) "$lat ms recorded" }

# ------------------------------------------------- NFR1.6 / 1.7 blanks -----
Write-Host ""
Write-Host "-- NFR1.6/1.7: inconclusive path + result-field invariant"
Add-Type -AssemblyName System.Drawing
$blankPath = Join-Path $env:TEMP "hemospot-blank.png"
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$bmp.Save($blankPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
$blank = Invoke-Analyze -ImagePath $blankPath
Check "NFR1.6 blank image verdict is inconclusive" ($blank.status -eq 200 -and $blank.json.verdict -eq "inconclusive") "status $($blank.status), verdict '$($blank.json.verdict)'"
Check "NFR1.6 inconclusive carries an explanation" ($null -ne $blank.json.explanation) "explanation present: $($null -ne $blank.json.explanation)"
Write-Host ("   blank image -> verdict '{0}', confidence {1}" -f $blank.json.verdict, $blank.json.confidence)

$inv1 = Get-MgmtScalar -Env $H -Sql "select count(*)::text from public.analyses where verdict is not null and verdict <> 'inconclusive' and (confidence is null or explanation is null);"
Check "NFR1.6/1.7 no definitive verdict without confidence+explanation" ($inv1 -eq "0") "violating rows: $inv1"
$inv2 = Get-MgmtScalar -Env $H -Sql "select count(*)::text from public.analyses where status = 'ready_for_review' and (verdict is null or confidence is null or explanation is null or model_sha256 is null);"
Check "NFR1.7 no ready_for_review row missing result fields" ($inv2 -eq "0") "violating rows: $inv2"

# -------------------------------------------------------- NFR1.5 hashes -----
Write-Host ""
Write-Host "-- NFR1.5: hash chain"
$rowSha = Get-MgmtScalar -Env $H -Sql ("select sha256_hex from public.evidence where id = '{0}'" -f $EV_O)
Check "NFR1.5 evidence row hash equals file hash" ($rowSha -eq $patternSha) "row $rowSha vs file $patternSha"

$dlPath = Join-Path $env:TEMP "hemospot-dl.png"
& curl.exe -s -o $dlPath "$SUPABASE_URL/storage/v1/object/evidence/$($analyst.id)/verify-pattern.png" `
  -H "apikey: $ANON" -H "Authorization: Bearer $($analyst.token)" 2>$null | Out-Null
$dlSha = (Get-FileHash -LiteralPath $dlPath -Algorithm SHA256).Hash.ToLower()
Check "NFR1.5 downloaded bytes hash matches row" ($dlSha -eq $rowSha) "download $dlSha vs row $rowSha"

# the drill object: create once, then prove it can never be overwritten
$drillPath = "$($analyst.id)/drill-proof.png"
$upDrill = Invoke-Http -Method POST -Url "$SUPABASE_URL/storage/v1/object/evidence/$drillPath" `
  -Headers $analystH -BodyFile $patternPath -ContentType "image/png"
$created = $upDrill.status -ge 200 -and $upDrill.status -lt 300
$exists = $upDrill.body -match 'exist'
Check "NFR1.5 drill object uploadable (first run) or immutable (later runs)" ($created -or $exists) "HTTP $($upDrill.status): $($upDrill.body.Substring(0,[Math]::Min(80,$upDrill.body.Length)))"

$dlDrill = Join-Path $env:TEMP "hemospot-drill-dl.png"
& curl.exe -s -o $dlDrill "$SUPABASE_URL/storage/v1/object/evidence/$drillPath" `
  -H "apikey: $ANON" -H "Authorization: Bearer $($analyst.token)" 2>$null | Out-Null
$drillSha = (Get-FileHash -LiteralPath $dlDrill -Algorithm SHA256).Hash.ToLower()
Check "NFR1.5 drill object bytes hash matches file hash" ($drillSha -eq $patternSha) "download $drillSha vs file $patternSha"

# register the drill row via the real REST path (as the analyst, fenced)
$drillRow = @{
  case_id = $CASE_O; file_name = "drill-proof.png"
  storage_path = $drillPath; mime_type = "image/png"
  size_bytes = $patternSize; sha256_hex = $patternSha
  item_type = "scene_photo"; uploaded_by = $analyst.id
} | ConvertTo-Json -Compress
$rowResp = Invoke-Http -Method POST -Url "$SUPABASE_URL/rest/v1/evidence" -Headers $analystH -Body $drillRow
Check "NFR1.5 drill evidence row registered via REST" ($rowResp.status -ge 200 -and $rowResp.status -lt 300) "HTTP $($rowResp.status)"

# ---------------------------------------------------------- NFR1.4 kill -----
Write-Host ""
Write-Host "-- NFR1.4: kill-test"
$mkAnalysis = (@{ evidence_id = $EV_O; requested_by = $lead.id } | ConvertTo-Json -Compress)
$rA = Invoke-Http -Method POST -Url "$SUPABASE_URL/rest/v1/analyses" -Headers $leadH -Body $mkAnalysis
$parsedA = $rA.body | ConvertFrom-Json
$analysisId = @($parsedA)[0].id
Check "NFR1.4 drill analysis created" ($rA.status -ge 200 -and $rA.status -lt 300 -and $analysisId) "HTTP $($rA.status), id $analysisId, body $($rA.body.Substring(0,[Math]::Min(120,$rA.body.Length)))"

$mkJob = (@{ analysis_id = $analysisId } | ConvertTo-Json -Compress)
$rJ = Invoke-Http -Method POST -Url "$SUPABASE_URL/rest/v1/analysis_jobs" -Headers $leadH -Body $mkJob
$parsedJ = $rJ.body | ConvertFrom-Json
$jobId = @($parsedJ)[0].id
Check "NFR1.4 drill job enqueued" ($rJ.status -ge 200 -and $rJ.status -lt 300 -and $jobId) "HTTP $($rJ.status), id $jobId, body $($rJ.body.Substring(0,[Math]::Min(120,$rJ.body.Length)))"
Write-Host ("   analysis {0} / job {1}" -f $analysisId, $jobId)

# black-hole socket: accept the connection, never answer
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$holePort = $listener.LocalEndpoint.Port
$listener.BeginAcceptTcpClient($null, $null) | Out-Null
Write-Host "   black hole listening on 127.0.0.1:$holePort"

$env:WORKER_EMAIL = "firman@hemospot.local"
$env:WORKER_PASSWORD = $H.password
$env:SIDECAR_URL = "http://127.0.0.1:$holePort"
$env:POLL_SECONDS = "1"
$env:STALE_MINUTES = "99"
$env:MAX_ATTEMPTS = "5"

$workerA = Start-Process -FilePath "python" -ArgumentList "worker.py" -WorkingDirectory $sidecarDir -PassThru `
  -RedirectStandardOutput (Join-Path $resultsDir "workerA.log") -RedirectStandardError (Join-Path $resultsDir "workerA.err")

$claimed = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $st = Get-MgmtScalar -Env $H -Sql ("select status from public.analysis_jobs where id = '{0}'" -f $jobId)
  if ($st -eq "processing") { $claimed = $true; break }
}
Check "NFR1.4 phase A: worker claimed the job (status processing)" $claimed "observed: $st"
$pickedUp = Get-MgmtScalar -Env $H -Sql ("select picked_up_at from public.analysis_jobs where id = '{0}'" -f $jobId)
Write-Host "   claimed at $pickedUp; killing worker (pid $($workerA.Id)) mid-job"
Stop-Process -Id $workerA.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
try { $listener.Stop() } catch {}

$afterKill = Get-MgmtScalar -Env $H -Sql ("select status from public.analysis_jobs where id = '{0}'" -f $jobId)
Check "NFR1.4 phase A: job survives the kill (still claimed, not lost)" ($afterKill -eq "processing") "status after kill: $afterKill"

Write-Host "   waiting 65s real time so the claim goes stale (STALE_MINUTES=1)..."
for ($i = 0; $i -lt 13; $i++) { Start-Sleep -Seconds 5; Write-Host "     ...$((($i + 1) * 5))s" }

$env:SIDECAR_URL = $sidecarUrl
$env:POLL_SECONDS = "2"
$env:STALE_MINUTES = "1"
$workerB = Start-Process -FilePath "python" -ArgumentList "worker.py" -WorkingDirectory $sidecarDir -PassThru `
  -RedirectStandardOutput (Join-Path $resultsDir "workerB.log") -RedirectStandardError (Join-Path $resultsDir "workerB.err")

$done = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 2
  $st = Get-MgmtScalar -Env $H -Sql ("select status from public.analysis_jobs where id = '{0}'" -f $jobId)
  if ($st -eq "done") { $done = $true; break }
}
Check "NFR1.4 phase B: job re-queued and completed after restart" $done "final job status: $st"
Stop-Process -Id $workerB.Id -Force -ErrorAction SilentlyContinue

$workerLog = Get-Content -LiteralPath (Join-Path $resultsDir "workerB.log") -Encoding UTF8 -ErrorAction SilentlyContinue
$requeued = ($workerLog -join "`n") -match 're-queued'
Check "NFR1.4 phase B: worker log shows the stale re-queue" $requeued "workerB.log"

$res = Invoke-ManagementSql -Env $H -Sql ("select status || '|' || coalesce(verdict,'') || '|' || coalesce(confidence::text,'') || '|' || (explanation is not null)::text || '|' || coalesce(model_sha256,'') || '|' || coalesce(timing_ms::text,'') as r, (select attempts::text from public.analysis_jobs where id = '{1}') as attempts, (select last_error from public.analysis_jobs where id = '{1}') as last_error from public.analyses where id = '{0}'" -f $analysisId, $jobId)
$parsedRes = $res.body | ConvertFrom-Json
$rr = @($parsedRes)
$rRow = if ($rr.Count -gt 0) { $rr[0] } else { $null }
$parts = if ($rRow -and $rRow.r) { @($rRow.r -split '\|') } else { @('', '', '', '', '', '') }
$modelPreview = if ($parts[4]) { $parts[4].Substring(0, [Math]::Min(8, $parts[4].Length)) + ".." } else { "" }
Check "NFR1.4 phase B: analysis ready_for_review" ($parts[0] -eq "ready_for_review") "status: $($parts[0])"
Check "NFR1.6/1.7 completed job carries verdict+confidence+explanation+model+timing" `
  ($parts[1] -ne "" -and $parts[2] -ne "" -and $parts[3] -eq "True" -and $parts[4] -ne "" -and $parts[5] -ne "") `
  "verdict=$($parts[1]) conf=$($parts[2]) expl=$($parts[3]) model=$modelPreview timing=$($parts[5])"
Check "NFR1.4 attempts counted / no error recorded" ($rRow -and $rRow.attempts -eq "0" -and $rRow.last_error -eq "") "attempts=$(if ($rRow) { $rRow.attempts }), last_error='$(if ($rRow) { $rRow.last_error })'"

# -------------------------------------------------------------- report ------
$md = @()
$md += "# Engine drills - latest run"
$md += ""
$md += "project ``$($H.ref)`` - pattern ``$patternSha`` - $(Get-Date -Format 'yyyy-MM-dd HH:mm') local"
$md += ""
$md += "| check | result | detail |"
$md += "|---|---|---|"
foreach ($c in $checks) {
  $mark = if ($c.ok) { "PASS" } else { "**FAIL**" }
  $md += "| $($c.name) | $mark | $($c.detail) |"
}
$md += ""
$md += "Latency samples (NFR1.3, budget 5000 ms): " + (($latencies | ForEach-Object { "$_ ms" }) -join ", ")
$md += ""
$md += "workerB.log excerpt:"
$md += '```'
$md += ($workerLog | Select-Object -Last 12)
$md += '```'
$outFile = Join-Path $resultsDir "engine-drills-latest.md"
[System.IO.File]::WriteAllLines($outFile, $md, (New-Object System.Text.UTF8Encoding($false)))

if ($startedSidecar -and $sidecarProc) {
  Write-Host "stopping the sidecar this script started (pid $($sidecarProc.Id))"
  Stop-Process -Id $sidecarProc.Id -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host ("checks: {0}  passed: {1}  failed: {2}" -f $checks.Count, ($checks.Count - $failures.Count), $failures.Count)
if ($failures.Count -gt 0) { $failures | ForEach-Object { Write-Host "  FAIL: $_" } }
Write-Host "report: $outFile"
exit $failures.Count
