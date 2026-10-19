# ============================================================================
# build-corpus.ps1 - T-015 demo corpus builder.
#
# Takes the fetched images (demo/corpus/, see fetch-corpus.ps1) and turns them
# into a live "Demo corpus" case: evidence rows + stored objects + analysis
# jobs, then runs the real worker so every result is a genuine pipeline output
# cached in Postgres. Finally writes demo/provenance.md + provenance.csv.
#
# Idempotent: rerunning reuses the case/evidence/analyses and just verifies
# or regenerates the provenance files.
#
# Run from anywhere:  powershell -File demo\build-corpus.ps1
# ============================================================================

$ErrorActionPreference = "Continue"
$devRoot = Split-Path -Parent $PSScriptRoot
. "$devRoot\verification\nfr-lib.ps1"

$Env_ = Get-HemospotEnv -RepoRoot $devRoot
$url = $Env_.url
$outDir = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$manifestPath = Join-Path $PSScriptRoot "corpus-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "corpus-manifest.json missing - run fetch-corpus.ps1 first" }
$manifest = Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json

Write-Host "== Hemospot demo corpus builder (T-015) =="
$lead = Get-PersonaToken -Env $Env_ -Email "nahin_lead@hemospot.local"
$analyst = Get-PersonaToken -Env $Env_ -Email "firman@hemospot.local"
Write-Host ("signed in: lead " + $lead.id + " / analyst " + $analyst.id)

$leadH = @{ apikey = $Env_.anon; Authorization = "Bearer $($lead.token)"; Prefer = "return=representation" }
$analystH = @{ apikey = $Env_.anon; Authorization = "Bearer $($analyst.token)"; Prefer = "return=representation" }
$analystUp = @{ apikey = $Env_.anon; Authorization = "Bearer $($analyst.token)" }

# ---- the case (get-or-create) --------------------------------------------
$caseId = $null
$r = Invoke-Http -Method GET -Url "$url/rest/v1/cases?case_number=eq.DEMO-CORPUS&select=id" -Headers $leadH
if ($r.status -eq 200 -and $r.body -and $r.body -ne "[]") {
  $caseId = (@($r.body | ConvertFrom-Json))[0].id
  Write-Host "case exists: DEMO-CORPUS $caseId"
} else {
  $body = (@{
    case_number = "DEMO-CORPUS"
    title = "Demo corpus - public BPA samples"
    description = "Curated openly-licensed bloodstain images used to precompute demo/test results. Provenance: see demo/provenance.md in the repo."
    status = "open"
    created_by = $lead.id
  } | ConvertTo-Json -Compress)
  $r = Invoke-Http -Method POST -Url "$url/rest/v1/cases" -Headers $leadH -Body $body
  if ($r.status -ne 201) { throw "case create failed: HTTP $($r.status) $($r.body)" }
  $created = $r.body | ConvertFrom-Json
  $caseId = $created[0].id
  Write-Host "case created: DEMO-CORPUS $caseId"
}

# The analyst works this case: without an assignment the analyst cannot even
# see the case in their own queue (cases policy: assigned_to = auth.uid()).
$assign = Invoke-Http -Method PATCH -Url ("$url/rest/v1/cases?id=eq.$caseId") -Headers $leadH -Body (@{ assigned_to = $analyst.id } | ConvertTo-Json -Compress)
if ($assign.status -ge 400) { throw ("case assignment failed: HTTP " + $assign.status + " " + $assign.body) }

# ---- evidence + analyses per image ----------------------------------------
$n = 0
foreach ($it in $manifest.items) {
  $n++
  $local = Join-Path (Join-Path $PSScriptRoot "corpus") $it.file
  if (-not (Test-Path -LiteralPath $local)) { throw ("missing corpus file (run fetch-corpus.ps1): " + $it.file) }
  $mime = switch ([System.IO.Path]::GetExtension($it.file)) { ".png" { "image/png" } default { "image/jpeg" } }

  $q = Invoke-Http -Method GET -Url ("$url/rest/v1/evidence?case_id=eq.$caseId&file_name=eq.$([uri]::EscapeDataString($it.file))&select=id") -Headers $leadH
  $existing = @()
  if ($q.status -eq 200 -and $q.body) { $parsed = $q.body | ConvertFrom-Json; if ($null -ne $parsed) { $existing = @($parsed) } }
  if ($existing.Count -gt 0) {
    $evidenceId = $existing[0].id
    Write-Host ("  [{0,2}/11] have     {1}" -f $n, $it.file)
  } else {
    $sp = "$($analyst.id)/$($it.file)"
    $up = Invoke-Http -Method POST -Url "$url/storage/v1/object/evidence/$sp" -Headers $analystUp -BodyFile $local -ContentType $mime
    $uploaded = ($up.status -ge 200 -and $up.status -lt 300)
    $alreadyThere = ($up.body -match "already exists|Duplicate")
    if (-not $uploaded -and -not $alreadyThere) { throw ("storage upload failed for " + $it.file + ": HTTP " + $up.status + " " + $up.body) }
    # Verify the BYTES that landed in storage, not just the upload's status:
    # a refused fetch once stored a Wikimedia error page under the image's name.
    $dl = Join-Path $env:TEMP ("corpus-check-" + $it.file)
    & curl.exe -s -o $dl "$url/storage/v1/object/evidence/$sp" -H "apikey: $($Env_.anon)" -H "Authorization: Bearer $($analyst.token)" 2>$null
    $dlHash = (Get-FileHash -LiteralPath $dl -Algorithm SHA256).Hash.ToLower()
    if ($dlHash -ne $it.sha256) { throw ("stored bytes do not match the manifest hash: " + $it.file + " (stored " + $dlHash.Substring(0,12) + ", expected " + $it.sha256.Substring(0,12) + ")") }
    $body = (@{
      case_id = $caseId; file_name = $it.file; storage_path = $sp; mime_type = $mime
      size_bytes = $it.bytes; sha256_hex = $it.sha256; item_type = "scene_photo"; uploaded_by = $analyst.id
    } | ConvertTo-Json -Compress)
    $r = Invoke-Http -Method POST -Url "$url/rest/v1/evidence" -Headers $analystH -Body $body
    if ($r.status -ne 201) { throw ("evidence insert failed for " + $it.file + ": HTTP " + $r.status + " " + $r.body) }
    $createdRow = $r.body | ConvertFrom-Json
    $evidenceId = $createdRow[0].id
    Write-Host ("  [{0,2}/11] added    {1}" -f $n, $it.file)
  }

  # ---- custody chain ------------------------------------------------------
  # Each corpus item carries a real chain (collected -> sealed -> transferred)
  # so the custody screen has something honest to show: the rows are written
  # through the same INSERT-only path the UI uses, actor = the signed-in
  # analyst, and the chain cannot be edited afterwards.
  $qChain = Invoke-Http -Method GET -Url ("$url/rest/v1/custody_events?evidence_id=eq.$evidenceId&select=id") -Headers $leadH
  $haveChain = @()
  if ($qChain.status -eq 200 -and $qChain.body) { $parsedChain = $qChain.body | ConvertFrom-Json; if ($null -ne $parsedChain) { $haveChain = @($parsedChain) } }
  if ($haveChain.Count -eq 0) {
    $steps = @(
      @{ action = "collected"; reason = "Registered from the public-photo corpus batch" },
      @{ action = "sealed"; reason = "Sealed for laboratory analysis" },
      @{ action = "transferred"; reason = "Handed to the analysis queue for classification" }
    )
    foreach ($step in $steps) {
      $chainBody = (@{ evidence_id = $evidenceId; actor = $analyst.id; action = $step.action; reason = $step.reason } | ConvertTo-Json -Compress)
      $r = Invoke-Http -Method POST -Url "$url/rest/v1/custody_events" -Headers $analystH -Body $chainBody
      if ($r.status -ne 201) { throw ("custody event insert failed for " + $it.file + ": HTTP " + $r.status + " " + $r.body) }
    }
  }

  $q = Invoke-Http -Method GET -Url ("$url/rest/v1/analyses?evidence_id=eq.$evidenceId&select=id") -Headers $leadH
  $haveAnalysis = @()
  if ($q.status -eq 200 -and $q.body) { $parsedA = $q.body | ConvertFrom-Json; if ($null -ne $parsedA) { $haveAnalysis = @($parsedA) } }
  if ($haveAnalysis.Count -eq 0) {
    $body = (@{ evidence_id = $evidenceId; requested_by = $lead.id } | ConvertTo-Json -Compress)
    $r = Invoke-Http -Method POST -Url "$url/rest/v1/analyses" -Headers $leadH -Body $body
    if ($r.status -ne 201) { throw ("analysis request failed for " + $it.file + ": HTTP " + $r.status + " " + $r.body) }
    $createdAnalysis = $r.body | ConvertFrom-Json
    $analysisId = $createdAnalysis[0].id
    $body = (@{ analysis_id = $analysisId } | ConvertTo-Json -Compress)
    $r = Invoke-Http -Method POST -Url "$url/rest/v1/analysis_jobs" -Headers $leadH -Body $body
    if ($r.status -ne 201) { throw ("job enqueue failed for " + $it.file + ": HTTP " + $r.status + " " + $r.body) }
  }
}

# ---- run the real worker ---------------------------------------------------
$sidecarDir = Join-Path $devRoot "sidecar"
$sidecarUrl = "http://127.0.0.1:8000"
$sidecarProc = $null
$workerProc = $null
$h = Invoke-Http -Method GET -Url "$sidecarUrl/health"
if ($h.status -ne 200 -or $h.body -notmatch '"model_loaded":\s*true') {
  Write-Host "starting sidecar..."
  $sidecarProc = Start-Process python -ArgumentList '-m', 'uvicorn', 'main:app', '--app-dir', 'app', '--port', '8000' `
    -WorkingDirectory $sidecarDir -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $outDir "sidecar.log") -RedirectStandardError (Join-Path $outDir "sidecar.err")
  $ok = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 2
    $h = Invoke-Http -Method GET -Url "$sidecarUrl/health"
    if ($h.status -eq 200 -and $h.body -match '"model_loaded":\s*true') { $ok = $true; break }
  }
  if (-not $ok) { throw "sidecar did not become healthy" }
}
Write-Host "sidecar healthy - starting worker (it will process every pending corpus job)"

$workerProc = Start-Process python -ArgumentList 'worker.py' -WorkingDirectory $sidecarDir -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $outDir "worker-corpus.log") -RedirectStandardError (Join-Path $outDir "worker-corpus.err")

$pendingSql = "select count(*)::text as n from public.analysis_jobs j join public.analyses a on a.id = j.analysis_id join public.evidence e on e.id = a.evidence_id join public.cases c on c.id = e.case_id where c.case_number = 'DEMO-CORPUS' and j.status <> 'done';"
$done = $false
for ($i = 0; $i -lt 130; $i++) {
  Start-Sleep -Seconds 5
  $pending = Get-MgmtScalar -Env $Env_ -Sql $pendingSql
  if ($i % 4 -eq 0) { Write-Host ("  pending jobs: " + $pending) }
  if ($pending -eq "0") { $done = $true; break }
  if ($workerProc.HasExited) { Write-Host "worker exited early - check logs"; break }
}
if (-not $done) { throw "corpus jobs did not all finish in time" }

if ($workerProc -and -not $workerProc.HasExited) { Stop-Process -Id $workerProc.Id -Force -ErrorAction SilentlyContinue }
if ($sidecarProc -and -not $sidecarProc.HasExited) { Stop-Process -Id $sidecarProc.Id -Force -ErrorAction SilentlyContinue }
Write-Host "worker done, engine stopped"

# ---- provenance documents ---------------------------------------------------
$provSql = @"
select e.file_name, e.sha256_hex, a.id as analysis_id, a.status as analysis_status,
       coalesce(a.verdict,'') as verdict, coalesce(a.confidence::text,'') as confidence,
       coalesce(a.timing_ms::text,'') as timing_ms, coalesce(a.model_sha256,'') as model_sha256,
       j.status as job_status, j.attempts::text as attempts
from public.cases c
join public.evidence e on e.case_id = c.id
left join public.analyses a on a.evidence_id = e.id
left join public.analysis_jobs j on j.analysis_id = a.id
where c.case_number = 'DEMO-CORPUS'
order by e.file_name;
"@
$prov = Invoke-ManagementSql -Env $Env_ -Sql $provSql
# PowerShell 5.1 gotcha: ConvertFrom-Json emits a JSON ARRAY as ONE pipeline
# object, so `@($body | ConvertFrom-Json)` collapses 11 rows into a single
# element. Assign first (the variable then holds the array), wrap after.
$rows = $prov.body | ConvertFrom-Json
if ($null -eq $rows) { $rows = @() }

$map = @{}
foreach ($it in $manifest.items) { $map[$it.file] = $it }

$csv = @()
$md = @()
$md += "# Demo corpus provenance (T-015)"
$md += ""
$md += "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm') - project pkebstfwndhftxajztcx"
$md += ""
$md += "Every image below is loaded in the live database as evidence in case ``DEMO-CORPUS``"
$md += "and its cached result is a genuine output of the deployed pipeline (worker + sidecar,"
$md += "model ``bpa-catboost-v1``). Images are curated Wikimedia Commons files for platform"
$md += "testing; **no ground-truth mechanism label is claimed** for them."
$md += ""
$md += "| file | license | author | source | verdict | confidence | timing ms | job |"
$md += "|------|---------|--------|--------|---------|------------|-----------|-----|"
foreach ($row in ($rows | Sort-Object file_name)) {
  $meta = $map[$row.file_name]
  $lic = if ($meta) { $meta.license } else { "?" }
  $auth = if ($meta) { $meta.author } else { "?" }
  $page = if ($meta) { "[Commons]($($meta.page))" } else { "?" }
  $conf = if ($row.confidence) { [math]::Round([double]$row.confidence, 3) } else { "" }
  $md += ("| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} |" -f $row.file_name, $lic, $auth, $page, $row.verdict, $conf, $row.timing_ms, $row.job_status)
  $srcPage = ""
  if ($meta) { $srcPage = $meta.page }
  $csv += [PSCustomObject]@{
    file = $row.file_name; verdict = $row.verdict; confidence = $row.confidence; timing_ms = $row.timing_ms
    model_sha256 = $row.model_sha256; analysis_id = $row.analysis_id; analysis_status = $row.analysis_status
    job_status = $row.job_status; attempts = $row.attempts; image_sha256 = $row.sha256_hex
    license = $lic; author = $auth; source_page = $srcPage
  }
}
$md += ""
$md += "Re-run: ``powershell -File demo\fetch-corpus.ps1`` (re-fetch images) then ``powershell -File demo\build-corpus.ps1`` (rebuild cache + this file)."

[System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot "provenance.md"), $md, [System.Text.UTF8Encoding]::new($false))
$csv | Export-Csv -LiteralPath (Join-Path $PSScriptRoot "provenance.csv") -NoTypeInformation -Encoding UTF8

$ready = @($rows | Where-Object { $_.job_status -eq "done" }).Count
Write-Host ""
Write-Host ("corpus items: " + $rows.Count + "  jobs done: " + $ready)
$verdicts = $rows | Group-Object verdict | ForEach-Object { $_.Name + "=" + $_.Count }
Write-Host ("verdicts: " + ($verdicts -join ", "))
Write-Host ("provenance: " + (Join-Path $PSScriptRoot "provenance.md"))
