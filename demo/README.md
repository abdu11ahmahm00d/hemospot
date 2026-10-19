# Demo corpus (T-015)

Eleven openly-licensed bloodstain photographs that the platform can chew on:
upload them as evidence, let the worker classify them, and the results stay
cached in Postgres. That is the demo corpus - the fallback path when the
sidecar is not running.

**The corpus is a test fixture, not a benchmark.** The images are typical
Commons photographs (drops on asphalt, stains on fabric, a spatter on a
sidewalk), not the Attinger/Kannan/Ferrarini sets the model was trained on, so
no ground-truth mechanism label is claimed for any of them. The verdicts in
`provenance.md` are the model's honest output on out-of-distribution photos -
which is a better demo story than a memorized training set anyway.

## Layout

| file | what it is |
|------|------------|
| `fetch-corpus.ps1` | downloads the images, writes `corpus-manifest.json` (source, license, author, sha256) |
| `build-corpus.ps1` | loads the images as evidence in case `DEMO-CORPUS`, runs the real worker, writes `provenance.md` + `provenance.csv` |
| `corpus-manifest.json` | provenance manifest, generated (sha256 per file) |
| `provenance.md` | the table you show: file, license, author, source, verdict, confidence, timing |
| `corpus/` | the images themselves |

## Running it

```powershell
powershell -File demo\fetch-corpus.ps1     # only needed once; images are committed
powershell -File demo\build-corpus.ps1     # loads the case + caches the results
```

`build-corpus.ps1` is idempotent: rerunning it reuses the case, the evidence
rows and the analyses, and only regenerates the provenance files. It needs the
sidecar's `.env` (Supabase URL + anon key + the worker password) and the
Supabase CLI logged in for its read-back queries.

Every upload is verified by downloading the stored object again and comparing
its SHA-256 against the manifest - a refused download once stored a Wikimedia
error page under an image's name, and that class of bug is invisible unless the
bytes are checked.

## Licensing

Every image is a Wikimedia Commons file used under its own license (CC BY or CC
BY-SA). The per-file license, author and source page are in
`corpus-manifest.json` and in `provenance.md`; attribution lives with the
data, so the corpus can be shared as long as the credit travels with it.

| file | license | author |
|------|---------|--------|
| sidewalk-spatter.jpg | CC BY-SA 3.0 | Bubba73 |
| bedsheet-stains.jpg | CC BY-SA 4.0 | Panamitsu |
| undershirt-stains.jpg | CC BY-SA 4.0 | Ser Amantio di Nicolao |
| drop-pattern.jpg | CC BY 1.0 | Nyki m |
| gauze-blood.jpg | CC BY-SA 2.0 | Lee Haywood |
| civet-trail.jpg | CC BY-SA 3.0 | Verity67 |
| asphalt-drops-1.jpg | CC BY-SA 4.0 | Modern primat |
| asphalt-drops-2.jpg | CC BY-SA 4.0 | Modern primat |
| snow-stain.jpg | CC BY-SA 2.0 | Jeremy Bolwell |
| snow-animal-scene.jpg | CC BY 2.0 | V. H. Hammer |
| small-spatter.png | CC BY-SA 3.0 | Panapp |

Wikimedia's CDN rate-limits bursts and answers `429` with an HTML page, so the
fetcher validates every download (magic bytes + size) and retries with a
growing pause. A file that is not a real image is deleted, never accepted.
