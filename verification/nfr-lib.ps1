# ============================================================================
# nfr-lib.ps1 - shared helpers for the NFR verification runners (T-016).
#
# Dot-source from a runner:  . "$PSScriptRoot\nfr-lib.ps1"
#
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1 files as
# ANSI, so any non-ASCII literal in this file would corrupt on parse.
# ============================================================================

function Get-HemospotEnv {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)
  $cfg = @{}
  Get-Content -LiteralPath (Join-Path $RepoRoot "sidecar\.env") -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^([A-Za-z_0-9]+)\s*=\s*(.+)$') { $cfg[$matches[1]] = $matches[2].Trim() }
  }
  $url = $cfg['SUPABASE_URL'].TrimEnd('/')
  return @{
    url      = $url
    anon     = $cfg['SUPABASE_ANON_KEY']
    password = $cfg['WORKER_PASSWORD']
    ref      = ([Uri]$url).Host.Split('.')[0]
    mgmt     = (Get-Content -LiteralPath (Join-Path $env:USERPROFILE ".supabase\access-token") -Encoding UTF8 -Raw).Trim()
  }
}

function Invoke-Http {
  param([string]$Method, [string]$Url, [hashtable]$Headers = @{}, [string]$Body = $null,
        [string]$BodyFile = $null, [string]$ContentType = "application/json")
  $curlArgs = @('-s', '-X', $Method, $Url)
  $tmpBody = $null
  # PS 5.1 mangles inline JSON quotes on the way to curl.exe - always hand
  # the body over as a file and let curl read it verbatim.
  if ($Body -and -not $BodyFile) {
    $tmpBody = Join-Path $env:TEMP ("hemospot-body-" + [Guid]::NewGuid().ToString('N') + ".json")
    [System.IO.File]::WriteAllText($tmpBody, $Body, [System.Text.UTF8Encoding]::new($false))
    $BodyFile = $tmpBody
  }
  foreach ($k in $Headers.Keys) { $curlArgs += @('-H', "$k`:$($Headers[$k])") }
  if ($BodyFile) { $curlArgs += @('-H', "Content-Type: $ContentType", '--data-binary', "@$BodyFile") }
  $curlArgs += @('-w', '|HTTPSTATUS:%{http_code}')
  $raw = (& curl.exe @curlArgs 2>$null) -join "`n"
  if ($tmpBody) { Remove-Item -LiteralPath $tmpBody -Force -ErrorAction SilentlyContinue }
  $marker = $raw.LastIndexOf('|HTTPSTATUS:')
  $status = 0
  $text = $raw
  if ($marker -ge 0) {
    $status = [int]$raw.Substring($marker + 12)
    $text = $raw.Substring(0, $marker)
  }
  return @{ status = $status; body = $text }
}

function Invoke-ManagementSql {
  param([hashtable]$Env, [string]$Sql)
  $payload = @{ query = $Sql } | ConvertTo-Json -Depth 2
  $tmp = Join-Path $env:TEMP ("hemospot-sql-" + [Guid]::NewGuid().ToString('N') + ".json")
  [System.IO.File]::WriteAllText($tmp, $payload, [System.Text.UTF8Encoding]::new($false))
  try {
    return Invoke-Http -Method POST -Url "https://api.supabase.com/v1/projects/$($Env.ref)/database/query" `
      -Headers @{ Authorization = "Bearer $($Env.mgmt)" } -BodyFile $tmp
  } finally { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}

function Get-PersonaToken {
  param([hashtable]$Env, [string]$Email)
  $body = (@{ email = $Email; password = $Env.password } | ConvertTo-Json -Compress)
  $resp = Invoke-Http -Method POST -Url "$($Env.url)/auth/v1/token?grant_type=password" `
    -Headers @{ apikey = $Env.anon } -Body $body
  if ($resp.status -ne 200) { throw "login failed for $Email (HTTP $($resp.status)): $($resp.body)" }
  $json = $resp.body | ConvertFrom-Json
  return @{ token = $json.access_token; id = $json.user.id }
}

function Expand-Tokens {
  param([string]$Text, [hashtable]$Map)
  foreach ($k in $Map.Keys) { $Text = $Text.Replace('$' + $k, [string]$Map[$k]) }
  return $Text
}

function Get-MgmtScalar {
  # One value from a one-row, one-column Management API query.
  param([hashtable]$Env, [string]$Sql)
  $r = Invoke-ManagementSql -Env $Env -Sql $Sql
  $parsed = $r.body | ConvertFrom-Json
  $rows = @($parsed)
  return [string]($rows[0].PSObject.Properties | Select-Object -First 1).Value
}
