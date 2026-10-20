# Submission checklist — T-017

Group 3 · BBA/DIU · Capstone Lab Assessment 1 · 2026-10-20

Everything the assessor receives, where it lives, and what must be true before
it is handed over.

---

## 1. What is being submitted

| # | Artefact | Lives in | State |
|---|----------|----------|-------|
| 1 | The working system | `github.com/abdu11ahmahm00d/hemospot` (public, `main`) | live, CI green on every commit |
| 2 | The **SRS** (requirements → code → evidence) | `docs/SRS.md` | final |
| 3 | The **methodology** (how it was built and proven) | `docs/METHODOLOGY.md` | final |
| 4 | The **demo runbook** (the rehearsal script) | `docs/DEMO-RUNBOOK.md` | final |
| 5 | The **viva sheets** (per-module defence + question bank) | `docs/VIVA-PREP.md` | final |
| 6 | The **demo video** (61 s, end to end) | `demo/video/demo-walkthrough.mp4` | recorded, regenerable |
| 7 | The **verification evidence** | `verification/results/*.md` | 100/100 + 21/21 |
| 8 | The **corpus provenance** (licences, authors, verdicts) | `demo/provenance.md` | 11 images |

## 2. The bundle

Copy these into the folder that goes to the assessor
(`…\Software Engineering Design Capstone Project\Capstone Final\`):

```powershell
$repo = "C:\Users\YourName\Documents\study\semester 8\Software Engineering Design Capstone Project\development"
$final = "C:\Users\YourName\Documents\study\semester 8\Software Engineering Design Capstone Project\Capstone Final"
$viva  = "C:\Users\YourName\Documents\study\semester 8\Software Engineering Design Capstone Project\Viva Prep"

New-Item -ItemType Directory -Force -Path $final, $viva | Out-Null
Copy-Item "$repo\docs\SRS.md"           $final -Force
Copy-Item "$repo\docs\METHODOLOGY.md"   $final -Force
Copy-Item "$repo\docs\DEMO-RUNBOOK.md"  $final -Force
Copy-Item "$repo\docs\VIVA-PREP.md"     $viva  -Force
Copy-Item "$repo\demo\video\demo-walkthrough.mp4" $final -Force
Copy-Item "$repo\demo\provenance.md"    $final -Force
Copy-Item "$repo\verification\results\rbac-latest.md"           $final -Force
Copy-Item "$repo\verification\results\engine-drills-latest.md"  $final -Force
```

The repository copies are canonical — if you refresh the bundle, take it from
the repo, not the other way round.

## 3. Pre-submission gate (run these; all three must be green)

```powershell
cd "<repo>"

# 1. the code builds, lints and tests
cd app; npm run lint; npm test; npm run build; cd ..

# 2. the authorization matrix
powershell -File verification\rbac-matrix.ps1        # -> probes: 100  passed: 100

# 3. the engine drills (includes the worker kill-test, ~3 minutes)
powershell -File verification\engine-drills.ps1      # -> checks: 21  passed: 21
```

- [ ] `npm run lint` clean
- [ ] `npm test` green (2 tests)
- [ ] `npm run build` succeeds
- [ ] matrix 100/100
- [ ] drills 21/21
- [ ] GitHub Actions green on `main` (three jobs)
- [ ] the demo video plays on the machine that will present it
- [ ] `git status` clean — nothing uncommitted

## 4. The live-demo pre-flight (30 minutes before, on the demo machine)

```powershell
cd app; npm run dev                                   # terminal 1
cd sidecar; uvicorn main:app --app-dir app --port 8000   # terminal 2
cd sidecar; python worker.py                          # terminal 3
```

- [ ] app answers on `http://localhost:5173`
- [ ] `GET /health` returns `{"status":"ok", ...}`
- [ ] the worker logs a poll loop without errors
- [ ] `DEMO-CORPUS` exists with 11 evidence items and 11 analyses
- [ ] all five personas sign in (password from `sidecar/.env`)
- [ ] the video is on a USB stick as the fallback
- [ ] `verification/results/` is open in a tab for the viva

Full script and the fallback ladder: `docs/DEMO-RUNBOOK.md`.

## 5. Who presents what

| Segment | Owner | Material |
|---------|-------|----------|
| The problem and the architecture (2 min) | D1 | the engine, the platform, the four layers |
| The walkthrough (6 min) | D5 drives, D1 narrates the engine moments | `docs/DEMO-RUNBOOK.md` §5 |
| The data model and the permission model (3 min) | D2 | RLS as the permission model, the five roles, the search RPCs |
| Evidence and custody (2 min) | D3 | the hash chain, the append-only log, the storage rules |
| Reporting, notifications and the approval gate (2 min) | D4 | the PDF, the trigger-based notifications, the finalize gate |
| The proof (2 min) | whoever is confident | `verification/results/*.md`, the corpus provenance table |

**Viva rule:** the member who presents a module answers its questions
(`docs/VIVA-PREP.md` §1–5); everyone answers the cross-cutting ones (§6).
Nobody says "I don't know" — say what you know, then what you would check.

## 6. The two deltas to state before anyone asks

Say these yourself, early, in the same words the SRS uses:

1. **The frontend is React, not Vue.** The contract specifies the dashboard's
   contents, not the framework; ADR-002 records the decision and the reason.
   Every obligation in D5's module line is delivered.
2. **Notifications are in-app only.** The brief's module line mentions email;
   no email channel is implemented, and the SRS says so with the reason (a
   provider is a second infrastructure dependency for a capability no
   functional requirement asks for) and the cost (about a day).

Volunteering a known deviation is worth more than being caught by it.

## 7. Final hygiene

- [ ] no secret in the repository: `sidecar/.env`, `app/.env*` are git-ignored
- [ ] `git log --oneline` tells the story in order — the audit trail is part of
      the submission
- [ ] the SRS's traceability matrix cites probe numbers that exist
- [ ] the corpus provenance lists a licence for every image
- [ ] the issue tracker is closed or has a stated remaining item:
      [T-017](https://github.com/abdu11ahmahm00d/hemospot/issues/17)
