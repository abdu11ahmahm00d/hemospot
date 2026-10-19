# Verification scripts (T-016)

Two PowerShell scripts execute the NFR verification matrix documented in
`verification-matrix.md`. Both talk to the live project and the local engine
-- nothing is mocked.

## `rbac-matrix.ps1` -- NFR1.1, NFR1.2, NFR1.5 (policy probes)

94 probes across five seeded personas (admin, lead, analyst, reviewer,
viewer): per-table read/write/delete attempts, custody immutability,
role-escalation attempts (`profiles.role` self-update), storage read/write
denials and the hash chain. Fixtures are created first and torn down at the
start of every run, so the script is idempotent.

## `engine-drills.ps1` -- NFR1.3-1.7 (engine drills)

- 3 timed `POST /analyze` samples (NFR1.3)
- blank image through the sidecar -> `inconclusive` (NFR1.6)
- hash chain on real stored bytes (NFR1.5)
- the kill-test for NFR1.4 including a 65-second stale-claim window
- result-field invariants for NFR1.6/1.7

## Prerequisites

- `supabase` CLI logged in and the repo linked (`supabase db query --linked`
  must work; requires the personal access token in `~/.supabase/access-token`)
- `sidecar/.env` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WORKER_EMAIL`,
  `WORKER_PASSWORD` (the scripts reuse the worker credential for the demo
  personas)
- Python 3.11 on PATH with the sidecar dependencies installed (the scripts
  start `uvicorn` themselves if nothing is listening on port 8000)
- Seeded demo personas (`supabase/seed.sql`)

## Running

```powershell
cd "semester 8\Software Engineering Design Capstone Project\development"
powershell -NoProfile -ExecutionPolicy Bypass -File verification\rbac-matrix.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File verification\engine-drills.ps1
```

Expected runtime: matrix ~1 min, drills ~2-3 min (the stale-claim window is
real time). Both print a summary and write `results/<name>-latest.md`; exit
code 1 if any probe fails.

## Notes

- All fixtures use reserved UUIDs (`00000000-0000-4000-8000-...`) and case
  names `VERIFY-*`; each run recreates its own scenario (`scenario.sql`) so
  probe counts stay deterministic.
- The drills write `results/worker*.log` -- these are the raw worker evidence
  for the NFR1.4 kill-test.
