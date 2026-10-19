# ============================================================================
# fetch-corpus.ps1 - T-015 demo corpus fetcher.
#
# Downloads the curated demo/test images into demo/corpus/ and writes
# demo/corpus-manifest.json (provenance: Commons page, license, author,
# sha256, byte size). Idempotent: existing files with the right hash are
# kept. Images themselves are NOT committed (see demo/README.md).
#
# Run from anywhere:  powershell -File demo\fetch-corpus.ps1
# ============================================================================

$ErrorActionPreference = "Continue"
$demoDir = $PSScriptRoot
$corpusDir = Join-Path $demoDir "corpus"
if (-not (Test-Path -LiteralPath $corpusDir)) { New-Item -ItemType Directory -Path $corpusDir | Out-Null }

$ua = "HemospotDemo/1.0 (https://github.com/abdu11ahmahm00d/hemospot; student capstone project)"

function Test-RealImage([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  $len = (Get-Item -LiteralPath $path).Length
  # Wikimedia's error page is ~2 KB; real originals here start at ~12 KB.
  if ($len -lt 5000) { return $false }
  $bytes = Get-Content -LiteralPath $path -Encoding Byte -TotalCount 4
  if ($bytes.Count -lt 4) { return $false }
  $isJpeg = ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8 -and $bytes[2] -eq 0xFF)
  $isPng = ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47)
  return ($isJpeg -or $isPng)
}

$items = @(
  @{ file = "sidewalk-spatter.jpg";  url = "https://commons.wikimedia.org/wiki/Special:FilePath/Blood_on_the_sidewalk.jpg?width=1600";
     commons = "File:Blood on the sidewalk.jpg"; license = "CC BY-SA 3.0"; author = "Bubba73"; note = "1600px thumbnail of the 6000x4000 original" },
  @{ file = "bedsheet-stains.jpg";   url = "https://commons.wikimedia.org/wiki/Special:FilePath/Blood_stains_on_bed_sheets.jpg?width=1600";
     commons = "File:Blood stains on bed sheets.jpg"; license = "CC BY-SA 4.0"; author = "Panamitsu"; note = "1600px thumbnail" },
  @{ file = "undershirt-stains.jpg"; url = "https://commons.wikimedia.org/wiki/Special:FilePath/Bloodstains_on_an_undershirt.jpg?width=1600";
     commons = "File:Bloodstains on an undershirt.jpg"; license = "CC BY-SA 4.0"; author = "Ser Amantio di Nicolao"; note = "1600px thumbnail" },
  @{ file = "drop-pattern.jpg";      url = "https://commons.wikimedia.org/wiki/Special:FilePath/Blood.jpg?width=1600";
     commons = "File:Blood.jpg"; license = "CC BY 1.0"; author = "Nyki m"; note = "1600px thumbnail" },
  @{ file = "gauze-blood.jpg";       url = "https://commons.wikimedia.org/wiki/Special:FilePath/Blood_%284141132984%29.jpg?width=1600";
     commons = "File:Blood (4141132984).jpg"; license = "CC BY-SA 2.0"; author = "Lee Haywood"; note = "1600px thumbnail" },
  @{ file = "civet-trail.jpg";       url = "https://commons.wikimedia.org/wiki/Special:FilePath/Blood_stain_of_the_civet.jpg?width=1600";
     commons = "File:Blood stain of the civet.jpg"; license = "CC BY-SA 3.0"; author = "Verity67"; note = "1600px thumbnail" },
  @{ file = "asphalt-drops-1.jpg";   url = "https://commons.wikimedia.org/wiki/Special:FilePath/Asfalt_%C3%BCzerindeki_kan_damlalar%C4%B1-1.jpg?width=1600";
     commons = "File:Asfalt uzerindeki kan damlalari-1.jpg"; license = "CC BY-SA 4.0"; author = "Modern primat"; note = "Turkish: blood drops on asphalt; 1600px thumbnail" },
  @{ file = "asphalt-drops-2.jpg";   url = "https://commons.wikimedia.org/wiki/Special:FilePath/Asfalt_%C3%BCzerindeki_kan_damlalar%C4%B1-2.jpg?width=1600";
     commons = "File:Asfalt uzerindeki kan damlalari-2.jpg"; license = "CC BY-SA 4.0"; author = "Modern primat"; note = "Turkish: blood drops on asphalt; 1600px thumbnail" },
  @{ file = "snow-stain.jpg";        url = "https://commons.wikimedia.org/wiki/Special:FilePath/Blood_stain_on_the_snow_-_geograph.org.uk_-_5697811.jpg";
     commons = "File:Blood stain on the snow - geograph.org.uk - 5697811.jpg"; license = "CC BY-SA 2.0"; author = "Jeremy Bolwell"; note = "original file (640x480, smaller than the 1600px thumbnail)" },
  @{ file = "snow-animal-scene.jpg"; url = "https://commons.wikimedia.org/wiki/Special:FilePath/Nature_lends_such_evil_dreams.jpg?width=1600";
     commons = "File:Nature lends such evil dreams.jpg"; license = "CC BY 2.0"; author = "V. H. Hammer"; note = "animal predation scene; 1600px thumbnail" },
  @{ file = "small-spatter.png";     url = "https://commons.wikimedia.org/wiki/Special:FilePath/Blood_stain.png";
     commons = "File:Blood stain.png"; license = "CC BY-SA 3.0"; author = "Panapp"; note = "original file (231x287, smaller than the 1600px thumbnail)" }
)
function Fetch-Image([string]$url, [string]$dest) {
  # Wikimedia's CDN rate-limits bursts and answers 429 with an HTML error page.
  # That page is byte-identical to a "file" as far as a naive download cares,
  # so every attempt is validated and retried with a growing pause.
  for ($attempt = 1; $attempt -le 6; $attempt++) {
    & curl.exe -s -L -A $ua -o $dest $url 2>$null
    if (Test-RealImage $dest) { return $true }
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue }
    $wait = @(10, 25, 45, 60, 90, 120)[$attempt - 1]
    Write-Host ("   refused (attempt {0}/{1}); waiting {2}s" -f $attempt, 6, $wait)
    Start-Sleep -Seconds $wait
  }
  return $false
}

$manifest = @()
foreach ($it in $items) {
  $dest = Join-Path $corpusDir $it.file
  if (Test-RealImage $dest) {
    Write-Host ("have     " + $it.file)
  } else {
    Write-Host ("fetching " + $it.file)
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
    $ok = Fetch-Image $it.url $dest
    if (-not $ok -and $it.url -match '\?width=') {
      Write-Host ("   thumbnail refused - trying the original file")
      $ok = Fetch-Image ($it.url -replace '\?width=\d+', '') $dest
    }
    if (-not $ok) {
      throw ("could not fetch a valid image after 6 attempts (Wikimedia refused the request): " + $it.file)
    }
  }
  $hash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLower()
  $len = (Get-Item -LiteralPath $dest).Length
  $manifest += [PSCustomObject]@{
    file    = $it.file
    bytes   = $len
    sha256  = $hash
    commons = $it.commons
    page    = "https://commons.wikimedia.org/wiki/" + ($it.commons -replace ' ', '_')
    license = $it.license
    author  = $it.author
    note    = $it.note
  }
}

$doc = [PSCustomObject]@{
  generated = (Get-Date -Format "yyyy-MM-dd")
  source    = "Wikimedia Commons (curated for platform testing; no ground-truth class claimed)"
  items     = $manifest
}
$out = Join-Path $demoDir "corpus-manifest.json"
[System.IO.File]::WriteAllText($out, ($doc | ConvertTo-Json -Depth 4), [System.Text.UTF8Encoding]::new($false))
Write-Host ""
Write-Host ("corpus ready: " + $manifest.Count + " images, " + [int](($manifest | Measure-Object bytes -Sum).Sum / 1MB) + " MB total")
Write-Host ("manifest: " + $out)
