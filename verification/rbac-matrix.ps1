# ============================================================================
# rbac-matrix.ps1 - T-016, NFR1.1 / NFR1.2 / NFR1.5 verification runner.
#
# Runs the live role-by-role probe matrix in verification/probes.json against
# the real Supabase project, as the real demo personas, and prints/writes a
# pass-fail table proving: every disallowed attempt is denied, every allowed
# attempt goes through, and custody/evidence integrity holds.
#
# Usage (from anywhere):
#   powershell -File verification\rbac-matrix.ps1
#
# Needs: sidecar\.env (URL, anon key, worker password - the demo personas share
# it), a logged-in Supabase CLI (~\.supabase\access-token), and the fixture
# scenario to be applicable - this script applies verification\scenario.sql
# itself via the Management API. No database password is used anywhere.
# ============================================================================

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$dev = $PSScriptRoot
$verification = $PSScriptRoot
$resultsDir = Join-Path $verification "results"
if (-not (Test-Path -LiteralPath $resultsDir)) { New-Item -ItemType Directory -Path $resultsDir | Out-Null }

# ---------------------------------------------------------------- config ----
. "$PSScriptRoot\nfr-lib.ps1"
$H = Get-HemospotEnv -RepoRoot $root
$SUPABASE_URL = $H.url
$ANON = $H.anon
$PASSWORD = $H.password
$ref = $H.ref

$personas = @{
  admin    = "arman_admin@hemospot.local"
  lead     = "nahin_lead@hemospot.local"
  analyst  = "firman@hemospot.local"
  reviewer = "mosaddika_reviewer@hemospot.local"
  viewer   = "mowmita_viewer@hemospot.local"
}

$patternPath = Join-Path $root "sidecar\app\smoke_pattern.png"
$pattern = Get-Item -LiteralPath $patternPath
$patternSha = (Get-FileHash -LiteralPath $patternPath -Algorithm SHA256).Hash.ToLower()
$patternSize = $pattern.Length

# ------------------------------------------------------------ preflight -----
Write-Host "== Hemospot NFR matrix (T-016) =="
Write-Host "project: $ref  |  pattern: $($pattern.Name) $patternSha"
$tokens = @{}
$ids = @{}
foreach ($role in $personas.Keys) {
  $t = Get-PersonaToken -Env $H -Email $personas[$role]
  $tokens[$role] = $t.token
  $ids[$role] = $t.id
  Write-Host ("signed in as {0,-8} {1}" -f $role, $personas[$role])
}
$map = @{
  FIRMAN_ID = $ids['analyst']; NAHIN_ID = $ids['lead']; MOWMITA_ID = $ids['viewer']
  MOSADDIKA_ID = $ids['reviewer']; ARMAN_ID = $ids['admin']
}

# ------------------------------------------------------- scenario load ------
$scenario = [System.IO.File]::ReadAllText((Join-Path $verification "scenario.sql"))
$scenario = $scenario.Replace('__PATTERN_SHA256__', $patternSha).Replace('__PATTERN_SIZE__', [string]$patternSize)
$setup = Invoke-ManagementSql -Env $H -Sql $scenario
if ($setup.status -ge 400) { throw "scenario apply failed (HTTP $($setup.status)): $($setup.body)" }
Write-Host "scenario applied (fixtures torn down + recreated)"

# storage object: create-if-absent, uploaded as the analyst (own folder)
$objPath = "$($ids['analyst'])/verify-pattern.png"
$up = Invoke-Http -Method POST -Url "$SUPABASE_URL/storage/v1/object/evidence/$objPath" `
  -Headers @{ apikey = $ANON; Authorization = "Bearer $($tokens['analyst'])" } `
  -BodyFile $patternPath -ContentType "image/png"
if ($up.status -ge 400 -and $up.body -notmatch 'exist') {
  throw "evidence object upload failed (HTTP $($up.status)): $($up.body)"
}
Write-Host "evidence object present: evidence/$objPath"

# ------------------------------------------------------------- probes -------
$probesDoc = Get-Content -LiteralPath (Join-Path $verification "probes.json") -Encoding UTF8 -Raw | ConvertFrom-Json
$sh = @{}
$probesDoc.shorthands.PSObject.Properties | ForEach-Object { $sh[$_.Name] = $_.Value }
foreach ($k in $map.Keys) { $sh[$k] = $map[$k] }

$results = @()
$afterQueue = @()
foreach ($p in $probesDoc.probes) {
  $path = Expand-Tokens -Text $p.path -Map $sh
  $url = "$SUPABASE_URL/$path"
  $headers = @{ apikey = $ANON; Authorization = "Bearer $($tokens[$p.role])" }
  if ($p.storage) { $headers['Prefer'] = 'return=representation' } else { $headers['Prefer'] = 'return=representation' }
  if ($p.headers) { $p.headers.PSObject.Properties | ForEach-Object { $headers[$_.Name] = $_.Value } }

  $bodyText = $null
  $bodyFile = $null
  if ($p.body_raw_file) { $bodyFile = $patternPath }
  elseif ($p.body) { $bodyText = Expand-Tokens -Text ($p.body | ConvertTo-Json -Depth 6 -Compress) -Map $sh }

  $resp = Invoke-Http -Method $p.method -Url $url -Headers $headers -Body $bodyText -BodyFile $bodyFile `
    -ContentType $(if ($p.content_type) { $p.content_type } else { 'application/json' })

  # ---- assertion ----
  $pass = $false
  $got = ""
  $isEmptyArray = $false
  if ($resp.body -and $resp.body.Trim().StartsWith('[')) {
    # Never pipe straight into @(): PS 5.1 hands the parsed array over as a
    # single object there (a known quirk), which inverts every empty check.
    $parsed = $resp.body | ConvertFrom-Json
    $isEmptyArray = (@($parsed).Count -eq 0)
  }
  if ($p.expect -eq 'deny') {
    if ($p.method -in @('GET', 'PATCH', 'DELETE') -and -not $p.storage) {
      $pass = ($resp.status -ge 400) -or ($resp.status -ge 200 -and $resp.status -lt 300 -and $isEmptyArray)
    } elseif ($p.storage -and $p.method -eq 'DELETE') {
      $pass = $true  # the after-check (object still listed) is the real assertion for deletes
    } else {
      $pass = ($resp.status -ge 400)
    }
  } else {
    if ($p.method -eq 'GET' -and -not $p.storage) { $pass = ($resp.status -lt 300) -and (-not $isEmptyArray) }
    elseif ($p.method -eq 'POST' -and $p.body -and -not $p.storage -and -not $p.body_raw_file) {
      $pass = ($resp.status -ge 200 -and $resp.status -lt 300) -and -not $isEmptyArray
    } else { $pass = ($resp.status -ge 200 -and $resp.status -lt 300) }
  }
  $got = "HTTP $($resp.status)"
  if ($isEmptyArray) { $got += " []" }

  $results += [pscustomobject]@{
    n = $p.n; nfr = $p.nfr; role = $p.role; label = $p.label
    expect = $p.expect; got = $got; pass = $pass
  }
  if ($p.after) { $afterQueue += @{ probe = $p; resp = $resp } }
}

# ------------------------------------------------------------ after-checks --
foreach ($a in $afterQueue) {
  $p = $a.probe
  $ok = $true
  $detail = ""
  if ($p.after.sql) {
    $sql = Expand-Tokens -Text $p.after.sql -Map $sh
    $r = Invoke-ManagementSql -Env $H -Sql $sql
    $parsedRows = $r.body | ConvertFrom-Json
    $rows = @($parsedRows)
    $val = [string]($rows[0].PSObject.Properties | Select-Object -First 1).Value
    $ok = ($val -eq [string]$p.after.want)
    $detail = "after-sql: '$val' (want '$($p.after.want)')"
  }
  if ($p.after.storage_list_as) {
    $list = Invoke-Http -Method POST -Url "$SUPABASE_URL/storage/v1/object/list/evidence" `
      -Headers @{ apikey = $ANON; Authorization = "Bearer $($tokens[$p.after.storage_list_as])" } `
      -Body (@{ prefix = "$($ids['analyst'])"; limit = 100 } | ConvertTo-Json -Compress)
    $parsedList = $list.body | ConvertFrom-Json
    $names = @($parsedList | ForEach-Object { $_.name })
    $wantName = Expand-Tokens -Text $p.after.want_name -Map $sh
    $ok = ($names -contains $wantName)
    $detail = "after-list: object '$wantName' present = $ok"
  }
  for ($i = 0; $i -lt $results.Count; $i++) {
    if ($results[$i].n -eq $p.n) {
      $results[$i].pass = $results[$i].pass -and $ok
      $results[$i].got += " ; $detail"
    }
  }
}

# ------------------------------------------------------------- cleanup -----
# Probe 69 enqueues a REAL job row and probe 70 claims it, so the matrix leaves
# claimable rows behind: a live worker would claim them, fail on the fixture's
# non-existent storage object and burn retries on work that cannot succeed.
# Remove the runtime rows and put the fixed-uuid fixtures back to `done` so the
# queue stays clean for the next run (and for any worker running in parallel).
$cleanup = @"
delete from public.analysis_jobs
where id not in ('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000025')
  and analysis_id in (
    select a.id from public.analyses a
    join public.evidence e on e.id = a.evidence_id
    join public.cases c on c.id = e.case_id
    where c.case_number like 'VERIFY-%');
update public.analysis_jobs set status = 'done', picked_up_at = null
where id in ('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000025');
"@
$clean = Invoke-ManagementSql -Env $H -Sql $cleanup
if ($clean.status -ge 400) { Write-Warning "matrix cleanup failed: HTTP $($clean.status) $($clean.body)" }

# --------------------------------------------------------------- report -----
$failed = @($results | Where-Object { -not $_.pass })
$byNfr = $results | Group-Object nfr | Sort-Object Name
$md = @()
$md += "# RBAC matrix - latest run"
$md += ""
$md += "project ``$ref`` - personas: arman (admin), nahin (lead), firman (analyst), mosaddika (reviewer), mowmita (viewer)"
$md += ""
$md += "| metric | probes | passed | failed |"
$md += "|---|---|---|---|"
foreach ($g in $byNfr) {
  $f = @($g.Group | Where-Object { -not $_.pass }).Count
  $md += "| NFR $($g.Name) | $($g.Count) | $($g.Count - $f) | $f |"
}
$f = $failed.Count
$md += "| **total** | $($results.Count) | $($results.Count - $f) | $f |"
$md += ""
$md += "| # | NFR | role | expected | got | result | probe |"
$md += "|---|---|---|---|---|---|---|"
foreach ($r in $results) {
  $mark = if ($r.pass) { "PASS" } else { "**FAIL**" }
  $md += "| $($r.n) | $($r.nfr) | $($r.role) | $($r.expect) | $($r.got) | $mark | $($r.label) |"
}
$outFile = Join-Path $resultsDir "rbac-latest.md"
[System.IO.File]::WriteAllLines($outFile, $md, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("probes: {0}  passed: {1}  failed: {2}" -f $results.Count, ($results.Count - $failed.Count), $failed.Count)
if ($failed.Count -gt 0) {
  Write-Host "FAILURES:"
  $failed | ForEach-Object { Write-Host ("  #{0} [{1}] {2} - {3}" -f $_.n, $_.role, $_.label, $_.got) }
}
Write-Host "report: $outFile"
exit $failed.Count
