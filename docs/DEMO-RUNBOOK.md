# Demo runbook — the rehearsal script

Group 3 · BBA/DIU · Capstone Lab Assessment 1 · 2026-10-20

Everything below was executed against the live project; the timings are from the
recorded rehearsal, not guesses. Run the whole thing twice before the
presentation: once with this document open, once cold. If you cannot do the
cold run, you are not ready.

---

## 1. The demo in one sentence

A lead investigator opens a case, registers a scene photograph whose SHA-256 is
computed in the browser, records a custody handoff, routes the analysis to an
analyst, the engine classifies the stains with an explanation, a supervisor
approves the result, and the platform produces a signed-off PDF report — with
every step auditable and every forbidden action refused by the database.

## 2. Ground rules

| Rule | Why |
|------|-----|
| The demo runs against the **live** project (`pkebstfwndhftxajztcx`) | A demo database is a lie you get caught in |
| The corpus results are **already cached** in Postgres | The demo survives a dead sidecar (see §6) |
| Every persona's password is the **same** shared demo password | One password to remember; it lives in `sidecar/.env` |
| Switch personas in a **second browser profile**, not a logout | Logging out loses the window state and wastes seconds |
| Never type a password on screen — paste from `sidecar/.env` | A password in a screen-share is a password in the log |

## 3. Pre-flight (do this 30 minutes before)

```powershell
# 1. the app (leave it running)
cd "<repo>\app"; npm install; npm run dev          # http://localhost:5173

# 2. the sidecar (leave it running, in a second terminal)
cd "<repo>\sidecar"; pip install -r requirements.txt
uvicorn main:app --app-dir app --port 8000
#    -> "GET /health" must answer {"status":"ok"}

# 3. the worker (leave it running, in a third terminal)
cd "<repo>\sidecar"; python worker.py
#    -> it polls analysis_jobs every few seconds

# 4. prove the system is healthy before anyone walks in
powershell -File verification\rbac-matrix.ps1        # -> probes: 100  passed: 100
powershell -File verification\engine-drills.ps1      # -> checks: 21  passed: 21
```

Expected: `100/100` and `21/21`. If either is red, **stop and fix it** — do not
demo a system you know is failing. The two scripts are also your answer to
"how do you know it works?" (they print their own reports to
`verification/results/`).

Also confirm:

- the demo case exists: `DEMO-CORPUS`, 11 evidence items, 11 analyses, all
  `done` (provenance table: `demo/provenance.md`)
- the video is on a USB stick as a fallback: `demo/video/demo-walkthrough.mp4`

## 4. The personas

| Persona | Login | Role | Use it for |
|---------|-------|------|-----------|
| Lead investigator | `nahin_lead@hemospot.local` | `lead_investigator` | the main thread of the demo |
| Analyst | `firman@hemospot.local` | `analyst` | running the queued analysis |
| Supervisor | `mosaddika_reviewer@hemospot.local` | `reviewer` | approving the result |
| Viewer | `mowmita_viewer@hemospot.local` | `viewer` | the denial demonstration |
| Admin | `arman_admin@hemospot.local` | `admin` | the audit view |

All five share the demo password from `sidecar/.env`. The analyst is assigned
to `DEMO-CORPUS`; the lead can assign cases to anyone.

## 5. The script (10 minutes; the recorded run is 61 seconds for the walkthrough)

### 0:00 — Sign in (lead)

Open `http://localhost:5173`, sign in as the lead.

**Say:** *"Hemospot is a crime-scene blood pattern engine with the forensic
platform around it. Five roles, and the database — not the interface — decides
what each of them may see."*

### 0:30 — Dashboard

Point at the three cards: open cases, pending analyses, recent custody
activity.

**Say:** *"Every number here is a query the database answered under that
user's policies."*

### 1:00 — Cases: create one

Cases → New case → title *"Kitchen floor, spatter, 03:40"*, description with
the scene details → create.

**Say:** *"The case number is generated server-side, so two investigators
cannot collide on it. The moment it is created, an audit transition is
recorded — the trail starts before anyone touches the evidence."*

### 2:00 — Case detail: the lifecycle

Open the new case. Show the transition timeline, then move the case
`open → investigate`.

**Say:** *"Transitions are not a UI status field. The RPC moves the case and
writes the transition in one transaction, and the order is enforced — you
cannot jump straight to closed."*

### 3:00 — Evidence: register a photograph

Evidence → Case → DEMO-CORPUS → Register evidence → pick
`demo/corpus/sidewalk-spatter.jpg` from disk → describe it → register.

Show the card: file name, type, size, and the SHA-256.

**Say:** *"The hash is computed in the browser with Web Crypto, over the file
bytes, before the upload. The stored object is the same bytes — the
verification button re-downloads it and re-hashes it. Nobody can swap the
picture afterwards: the storage bucket has no overwrite path."*

### 4:00 — Chain of custody: record a handoff

Chain of custody → pick the evidence item → action *Transferred to holder* →
reason *"moved to the lab for examination"* → Record handoff.

Then switch to the **viewer** persona (second browser window).

**Say:** *"Notice what happens with the viewer."* → try to record a handoff →
the button is refused.

**Say:** *"That is not the interface hiding a button — the database refuses
the insert. Try it with the API open and the answer is 403, because there is
no insert policy for that role. And the custody log has no update and no
delete policy at all: not even an admin can edit history."*

### 5:30 — Analyses: request and route

Analyses → the evidence item → Request analysis → route it to the analyst
(firman).

**Say:** *"The request does not run the model. It writes an analysis row and
queues a job — a row in a table, so a worker that dies mid-job loses
nothing."*

### 6:30 — Analyst: run the analysis

Switch to the **analyst** persona → Analyses → the queued item → run.

Show the result card: class, confidence, the per-stain geometry, and the
explanation with the top features and the values measured in this image.

**Say:** *"Class, confidence, per-class probabilities, and an explanation that
shows the features and the values that drove it. Below 0.60 the verdict is
'inconclusive' rather than a guess — five of our eleven corpus images come
back inconclusive, and that is the honest answer."*

### 8:00 — Supervisor: approve

Switch to the **reviewer** persona → Analyses → Approve (or reject with a
reason).

**Say:** *"The lead who requested the analysis cannot approve it. Only a
reviewer can, and once a result is finalized the database refuses to rewrite
it — there is a trigger on the table for exactly that."*

### 9:00 — Reports

Reports → DEMO-CORPUS → render the PDF.

**Say:** *"One click: evidence metadata, the custody chain with names, the
analysis findings and the approval, in a document that can go in a case file."*

### 9:30 — Search

Search → "spatter" → show the ranked results and the filters.

**Say:** *"Full text over cases and evidence, ranked — and filtered by role.
The search functions run with the caller's permissions, so an analyst's
results contain only their own cases, and an evidence hit whose case is
hidden is dropped rather than shown blind."*

### 10:00 — The proof

Open `verification/results/rbac-latest.md` and
`verification/results/engine-drills-latest.md`.

**Say:** *"100 authorization probes across five personas and 21 engine drills,
including killing a worker mid-job and showing that the job is re-queued and
completed. Those run on every push in CI, and they are what I mean when I say
the requirements are met."*

## 6. The fallback ladder

When something breaks, say the fallback out loud — an examiner values a
controlled degradation more than a scramble.

| Symptom | Do this | Say this |
|---------|---------|----------|
| The sidecar is not up | Nothing — the cached results are in Postgres | *"The engine is offline, so I am showing the cached verdict from the same pipeline that produced it. Here is the corpus provenance table."* |
| The worker is not up | Start it (`python worker.py`); queued jobs drain in seconds | *"The queue is a table, so the work was never lost — it was waiting."* |
| No internet | The app needs the hosted Postgres; the corpus is already cached | *"The demo needs the hosted database; every result shown is already stored, so the analysis story still stands."* |
| The browser cannot reach Supabase | Use the recorded video | *"Let me play the recorded run, and I will talk over the parts that matter."* |
| A probe fails | Stop the demo and fix it | *"A probe is red, so I am not going to claim it works. Let me show you what it says."* — then show the report |

The recorded video (`demo/video/demo-walkthrough.mp4`, 61 s) covers the whole
flow and is regenerated by `demo/record-demo.ps1`.

## 7. The eight questions you will be asked, and the one-line answers

1. **Why React when the brief said Vue?** → *"The brief specifies the
   dashboard's contents, not the framework; ADR-002 records the reversal and
   why. All of D5's obligations are delivered."*
2. **How do you know a viewer cannot read a case?** → *"100 probes. Every
   persona attempts every operation; the denial is Postgres's, not the UI's."*
3. **What if a worker dies mid-analysis?** → *"The kill-test: SIGKILL a worker
   mid-job, and a restarted worker re-queues the stale claim and completes it
   with no data loss."*
4. **Can the custody log be edited?** → *"There is no update policy and no
   delete policy on that table. Not for an admin."*
5. **How do you know the image you analyse is the image you stored?** → *"The
   SHA-256 is computed client-side on upload, stored with the row, and the
   verification path re-downloads the object and re-hashes it. 100% match."*
6. **What happens with a photo the model cannot classify?** → *"Below 0.60
   confidence the verdict is 'inconclusive', with an explanation. Five of
   eleven corpus images land there."*
7. **How fast is an analysis?** → *"57–597 ms in the drill, 10–511 ms across
   the corpus, against a 5-second budget."*
8. **What is the weakest part of the system?** → *"The behavioural test suite
   is two tests deep, and the email notification channel is not implemented —
   in-app only. Both are in the SRS limitations."

## 8. After the demo

- Leave the sidecar, worker and dev server running until the viva ends.
- Do not re-run the corpus builder after the demo — it is idempotent, but it
  rewrites `demo/provenance.md` and the timestamp changes.
- Keep the terminal tab with `verification/results/` open for the viva.
- One member takes the questions on the data model and RLS, one on the engine,
  one on the workflow — see `docs/VIVA-PREP.md`.
