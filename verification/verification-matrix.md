# NFR Verification Matrix (T-016)

Live-project verification of all seven NFRs in the final FR/NFR contract
(`Lab_Assessment1_G3_H1`). Every row below is proven by executable probes
against the deployed Supabase project + the real sidecar and worker -- not by
reading code.

- **Date:** 2026-10-19
- **Project:** `pkebstfwndhftxajztcx`
- **Verdict:** 94/94 RBAC probes + 21/21 engine checks = **115/115 PASS**

## The matrix

| NFR | Requirement (abridged) | How it is proven | Result |
|-----|------------------------|------------------|--------|
| NFR1.1 | Role denial 100% | 94 live REST/Storage probes: every persona (admin, lead, analyst, reviewer, viewer) attempted allowed and forbidden operations on every table, views, storage, and queue. Denials observed as PostgREST 42501 / empty result / storage 403. | **PASS 94/94** |
| NFR1.2 | Custody append-only 100% | `custody_events` carries no UPDATE/DELETE policy at all; probes attempt PATCH/DELETE as admin, lead, reviewer -- all refused; `select` remains open to staff as designed. | **PASS** |
| NFR1.3 | ≤ 5 s per image | 3 timed `POST /analyze` calls with the verification pattern image, plus a full worker round-trip. | **PASS** (260 / 52 / 55 ms; budget 5000 ms) |
| NFR1.4 | Retry-to-completion | Kill-test: worker claims a real job whose sidecar points at a TCP black hole, is SIGKILLed mid-flight; claim survives the kill; a restarted worker (1-min stale window) re-queues the abandoned claim and completes it to `ready_for_review` with `attempts=0`, `last_error=''`. | **PASS** |
| NFR1.5 | Hash match 100% | SHA-256 chain: local file bytes == uploaded+stored object bytes (downloaded) == `evidence.sha256_hex` row value; re-upload to the same key is refused so bytes cannot be overwritten. | **PASS** |
| NFR1.6 | Label + confidence + explanation, or "inconclusive" | Blank image → `verdict='inconclusive'`, `confidence=0.0`; DB invariant query: zero non-inconclusive results missing verdict/confidence/explanation (and the inverse). | **PASS** |
| NFR1.7 | No definitive label without confidence + explanation | Same DB invariant from the other side: a completed analysis can reach `ready_for_review` only carrying verdict + confidence + explanation + model hash + timing (checked on the kill-test's completed job). | **PASS** |

## Reproduce

```powershell
cd "semester 8\Software Engineering Design Capstone Project\development"
powershell -NoProfile -ExecutionPolicy Bypass -File verification\rbac-matrix.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File verification\engine-drills.ps1
```

See `README.md` in this folder for prerequisites and what each script does.

## Evidence

- `results/rbac-latest.md` -- 94 probes, per-probe expected vs observed outcome
- `results/engine-drills-latest.md` -- 21 checks incl. the NFR1.4 kill-test
  (worker logs `workerA.log` / `workerB.log` are kept alongside)

Both scripts exit non-zero on any failure, so CI or a viva rerun either
reproduces the green run or shows exactly which probe broke.
