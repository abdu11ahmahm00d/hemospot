# Software Requirements Specification — Hemospot

**Crime-Scene Blood Pattern Engine**
Group 3 · BBA/DIU · Capstone Lab Assessment 1 (G3/H1) · revision 2026-10-20

---

## 1. Purpose and scope

Hemospot is a web application for crime-scene bloodstain analysis. Investigators
upload scene photographs; a machine-learning pipeline detects the stains and
classifies the pattern; and around that engine sits the forensic platform an
investigation actually needs: case workflow, hashed evidence, an immutable
custody log, supervisor-approved analysis routing, one-click PDF reports and
role-filtered search.

The engine is not a research prototype: it wraps a published, peer-reviewed
pipeline (`sidecar/`), pins the model by SHA-256, and returns an explanation
with every verdict. What this document specifies is the **platform** — the
requirements we are accountable for — and it traces every one of them to the
code that implements it and the evidence that proves it.

**Out of scope:** the stain-detection research itself (the paper's method and
its dataset are upstream), and the training pipeline (the model artefact is
versioned and served, not trained, by this project).

## 2. The system in one page

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| Browser | React 19 + TypeScript + Vite + shadcn/ui | The operator's screens: cases, evidence, custody, analyses, reports, search |
| Data | Supabase (Postgres + Auth + Storage) | The system of record: 8 tables, Row Level Security as the permission model, full-text search RPCs, trigger-generated notifications |
| Engine | FastAPI sidecar + CatBoost model | One image in, one JSON verdict out: label, confidence, per-class probabilities, per-stain geometry, explanation, timing, model hash |
| Worker | `sidecar/worker.py` | Claims queued analysis jobs, calls the engine, writes the result, retries on failure |
| Evidence | Supabase Storage bucket `evidence` | The bytes, plus EXIF summary captured at ingest |

The browser never trusts itself: every permission decision is a Postgres policy,
so the API refuses a forbidden operation even if the UI would never offer it.

## 3. Roles

Five roles, defined once in `profiles.role` (a CHECK constraint) and enforced
by RLS. The assignment names them; here is what each may do.

| Role | May do | May not do |
|------|--------|------------|
| `admin` | everything, including case assignment and user management | — |
| `lead_investigator` | create/transition cases, register evidence, request analyses, route them, read all evidence and custody | approve their own routing |
| `analyst` | run analyses on evidence of cases assigned to them, record custody events | see cases they are not assigned to, approve results |
| `reviewer` | read cases in review or closed, approve or reject analyses, record custody | upload evidence, request analyses |
| `viewer` | read only, and only cases in review or closed | everything else — every write is denied |

A new signup defaults to `viewer` (the `handle_new_user()` trigger), so the
lowest-privilege role is the default, not an admin.

## 4. Functional requirements

Each requirement is quoted from the assessment contract, then implemented and
proven. "Evidence" points at the executable probe suite in
`verification/` (100 live probes + 21 engine drills) — not at a claim.

### FR1.1 — Create a case with a unique identifier, title and description

*Implemented:* `app/src/features/cases/cases.ts` → `generateCaseNumber()`,
`createCase()`; table `cases` with `case_number` UNIQUE. The number is
generated server-side from the case count, so two investigators cannot collide
on it.

*Proven:* probes 1–16 — case visibility per role (a viewer and a reviewer
cannot read an open case; an analyst reads only what is assigned to them; the
lead and admin read everything), and the create/edit verbs per role. The
identifier is a UNIQUE column, so a collision is impossible rather than
unlikely.

### FR1.2 — Record every lifecycle transition (open → investigate → review → closed) with actor and timestamp

*Implemented:* table `case_transitions` (append-only, actor + timestamp +
note), RPC `transition_case_status()` which both moves the case and writes the
transition in one transaction, and `next_case_status()` which enforces the
legal order. The UI reads the timeline from `fetchCaseWithTransitions()`.

*Proven:* probes 17–25 — the history of a case under review is visible to a
viewer but the history of an open case is not; an analyst and a lead record
transitions as themselves, and a transition written under someone else's name
is refused. The legal order itself is enforced inside the RPC by
`next_case_status()`, so an illegal jump is rejected by the database rather
than by the button.

### FR1.3 — Register evidence with file upload, a computed cryptographic hash and descriptive metadata

*Implemented:* `app/src/features/evidence/evidence.ts` → `sha256Hex()` (Web
Crypto, SHA-256 of the file bytes), `readExifSummary()` (make/model/captured-at
via `exifr`), `uploadEvidence()` (bytes to Storage, hash and metadata to
`evidence`), `verifyEvidence()` (re-hash the stored object and compare with the
stored value).

*Proven:* probes 26–34 (evidence visibility and registration per role),
46–47 (evidence rows cannot be edited or deleted — not even by an admin), and
90–92 (storage: no upload into another person's folder, no overwrite of an
existing object, no delete). The hash chain itself is three drills: the row's
hash equals the file's hash, the downloaded bytes hash equals the row's, and
the drill object behaves the same way.

### FR1.4 — Record every custody event (who, what, when, why) in an append-only log

*Implemented:* table `custody_events` with **no UPDATE policy and no DELETE
policy at all** — not even for an admin. `recordCustodyEvent()` in
`app/src/features/custody/custody.ts` inserts; the app offers no other verb.
Events carry actor, evidence item, action (`collected`, `transferred`,
`received`, `sealed`, `released`), timestamp and a free-text reason.

*Proven:* probes 35–45 — a viewer reads the chain of a closed case but not of
an open one; staff record events; a forged actor is refused; and UPDATE and
DELETE are refused for every role, admin included. Probes 95–96 cover the
reach an analyst needs on a case they are not assigned to.

### FR1.5 — Accept a stain photograph and produce automated stain detection with per-stain geometric features

*Implemented:* `POST /analyze` in the sidecar (`sidecar/app/main.py`) →
`analyze_image()` in `sidecar/app/analyzer.py`: colour segmentation in L\*a\*b\*
with Otsu thresholding, connected-component labelling, and
`per_stain_geometry()` returning per-stain area, major/minor axis, elongation
and orientation.

*Proven:* the drill "NFR1.6 blank image verdict is inconclusive" — a photograph
with no stains takes the inconclusive path instead of crashing the pipeline —
and the corpus run, where each of the 11 photographs returned a per-stain
list.

### FR1.6 — Classify each detected pattern into a trained impact class with per-class confidence probabilities

*Implemented:* the CatBoost classifier over the paper's feature vector
(`build_feature_vector()`); the response carries `verdict` (the winning
class), `confidence` and the full `probabilities` map over the trained
classes, so a reviewer can see how close the runner-up was.

*Proven:* corpus run — 11 results spanning `low_velocity` (5), `inconclusive`
(5) and `impact` (1) — and the drill "NFR1.6/1.7 no definitive verdict
without confidence+explanation", which checks the field invariants across every
stored result rather than one of them.

### FR1.7 — Route analysis requests from investigator to analyst, with supervisor approval before results are finalized

*Implemented:* `requestAnalysis()` creates the analysis and queues the job;
`routeAnalysis()` assigns an analyst; `reviewAnalysis()` records approve/reject
with a mandatory reason on rejection. The gate is enforced in the database by
the `forbid_result_rewrite()` trigger and by the RLS on `analyses`, so a
result cannot be edited into a different verdict after the fact — only
`ready_for_review → approved/rejected`.

*Proven:* probes 48–62 — analysis visibility per role (a reviewer cannot see
an analysis that is not ready for review), the request verb (lead/admin only),
the analyst finishing the run, and the approval gate: an analyst and a viewer
cannot approve, a reviewer can approve what is ready, and admin can. Probes
63–72 cover the job queue: who may enqueue, who may claim, who may only
look. A finalized result cannot be rewritten — the database rejects the
update.

### FR1.8 — Generate a PDF case report containing evidence metadata, custody log, analyses and approvals

*Implemented:* `app/src/features/reports/report-document.tsx` with
`@react-pdf/renderer`: the case header, the evidence table (name, type, size,
SHA-256), the custody chain with actor names, the analysis findings (verdict,
confidence, timing, model hash, explanation) and the approval decision. Actor
names are resolved through the `case_actor_names()` RPC rather than by joining
`profiles` directly, so a report can name actors on a case the caller may not
read in full.

*Proven:* the report renders end to end in the recorded walkthrough
(`demo/video/demo-walkthrough.mp4`, the "Reports" step). The rows it draws on
are covered by probes 17–20 (history), 35–45 (custody) and 48–62 (analyses
and approvals), and the actor names it prints come from the
`case_actor_names()` RPC rather than a direct join on `profiles`.

### FR1.9 — Full-text search across cases and evidence metadata, filtered by the requesting user's role

*Implemented:* maintained `tsvector` columns (`refresh_cases_search_vector()`,
`refresh_evidence_search_vector()`, normalised through `search_norm()` so
case and description are matched case-insensitively and accent-tolerantly),
ranked by `search_cases()` / `search_evidence()`. Both are **SECURITY INVOKER**:
RLS filters the candidate rows, so an analyst's results contain only cases
assigned to them, and an evidence hit whose case is hidden is dropped rather
than shown blind. The app adds status, type and date filters on top.

*Proven:* probes 97–100 — the analyst's search returns the case assigned to
them and filters out the one they are not assigned to; the viewer's search
returns a closed case and filters out an open one. These probes were drilled:
with the RPC temporarily set to `SECURITY DEFINER`, both filtered probes
failed, because the function could then see rows the caller may not.

## 5. Non-functional requirements

### NFR1.1 — Every protected resource denies access to users outside its permitted roles

Satisfied structurally: authorization lives in Postgres RLS, never in
application code. The UI hides what a role may not do, but hiding is
cosmetic — the API refuses it.

*Measured:* **100/100 probes pass.** Each persona (admin, lead, analyst,
reviewer, viewer) attempted both allowed and forbidden operations against
every table, the search RPCs, Storage and the job queue. Every denial was
observed as PostgREST `42501`, an empty result set or a Storage `403`; a
role-filtered read was observed as a `2xx` with an empty set.

*Evidence:* `verification/results/rbac-latest.md`

### NFR1.2 — The custody log is append-only; 100% of custody events are traceable to actor, timestamp and evidence item

`custody_events` has no UPDATE and no DELETE policy — the operations are
impossible, not merely forbidden by role. Every row carries `actor_id`,
`occurred_at` and `evidence_id` as NOT NULL foreign keys, and the report
resolves actor names for the trail.

*Measured:* **PASS.** PATCH and DELETE refused for admin, lead and reviewer.

### NFR1.3 — BPA analysis of one image completes in ≤ 5 s on the reference laptop CPU

The sidecar is a local process; the model is loaded once at start-up and the
measurement below is the full HTTP round-trip including inference.

*Measured:* **597 ms / 57 ms / 57 ms** for three consecutive `POST /analyze`
calls on the committed run (the first sample carries the model warm-up), and
**9.7 ms – 511.2 ms** across the 11-image demo corpus (median
≈ 85 ms) — roughly 10–50× inside the 5 s budget. The corpus's slowest image
(511 ms) is a wide street scene with many candidate pixels; the fastest
(9.7 ms) is a small close-up.

*Evidence:* `verification/results/engine-drills-latest.md`

### NFR1.4 — No custody event is lost when a queue worker fails mid-job; jobs retry to completion

The queue is a Postgres table (`analysis_jobs`), not an in-memory broker, so a
job that a dead worker claimed is still a row. `worker.py` claims a job
atomically, marks it stale after `STALE_MINUTES`, re-queues it and retries up
to `MAX_ATTEMPTS`; a storage object that is genuinely missing is treated as
permanent rather than retried forever.

*Measured:* **PASS by kill-test.** A worker was SIGKILLed mid-job while its
sidecar pointed at a TCP black hole. The claim survived the kill; a restarted
worker (1-minute stale window) re-queued the abandoned claim and completed it
to `ready_for_review` with `attempts=0` and `last_error=''`. No custody or
analysis row was lost.

### NFR1.5 — Recomputed evidence hashes match stored hashes on 100% of verification requests

Three independent points of comparison: the hash computed in the browser at
upload, the `evidence.sha256_hex` row, and the SHA-256 of the bytes actually
stored in Storage. The `verify_evidence_hash()` RPC compares the recomputed
digest with the stored one server-side.

*Measured:* **PASS.** 100% of verification requests matched, and re-uploading
to the same storage key is refused — bytes cannot be overwritten in place.

### NFR1.6 — Return a label, a confidence value and an explanation, or clearly return "inconclusive"

The engine's `CONFIDENCE_THRESHOLD = 0.60` decides: below it the verdict is
`inconclusive` with `confidence` as measured and an explanation saying why.
The explanation is not boilerplate: it lists the model's top features with
their importances and the values actually measured in this image.

*Measured:* **PASS.** A blank image returns `verdict='inconclusive'`,
`confidence=0.0` and a summary. The database invariant query finds zero
completed results that lack a verdict, a confidence, an explanation or a model
hash — and zero `inconclusive` rows that carry a definitive label.

### NFR1.7 — No classification is presented as definitive without confidence and explanation; low-confidence output is labelled "inconclusive"

The same rule enforced from the other side, and in the database: a completed
analysis can only reach `ready_for_review` carrying verdict, confidence,
explanation, model hash and timing — enforced by the approval-gate trigger and
the column NOT NULL constraints. The UI renders `inconclusive` as a neutral
state, never as a finding.

*Measured:* **PASS.** 5 of the 11 corpus images came back `inconclusive`
rather than being force-fitted to a class.

## 6. Traceability matrix

| Req | Module owner | Primary implementation | Evidence |
|-----|--------------|------------------------|----------|
| FR1.1 | D2 Cases & RBAC | `cases.ts:createCase` · table `cases` | probes 1–16 |
| FR1.2 | D2 Cases & RBAC | RPC `transition_case_status` · table `case_transitions` | probes 17–25 |
| FR1.3 | D3 Evidence & Custody | `evidence.ts:sha256Hex/uploadEvidence/verifyEvidence` | probes 26–34, 46–47, 90–92 + hash drills |
| FR1.4 | D3 Evidence & Custody | `custody.ts:recordCustodyEvent` · no UPDATE/DELETE policy | probes 35–45, 95–96 |
| FR1.5 | D1 BPA ML sidecar | sidecar `POST /analyze` → `analyze_image` · `per_stain_geometry` | blank-image drill · corpus run |
| FR1.6 | D1 BPA ML sidecar | CatBoost classifier · response `probabilities` | invariant drill · corpus run |
| FR1.7 | D4 Reporting & Notifications (workflow) / D2 (backend gate) | `analyses.ts:requestAnalysis/routeAnalysis/reviewAnalysis` · trigger `forbid_result_rewrite` | probes 48–62, 63–72 |
| FR1.8 | D4 Reporting & Notifications | `reports/report-document.tsx` · RPC `case_actor_names` | recorded walkthrough |
| FR1.9 | D2 Cases & RBAC | RPCs `search_cases` / `search_evidence` (SECURITY INVOKER) | probes 97–100 |
| NFR1.1 | D2 (policies) | RLS across 8 tables · 5 roles | 100/100 probes |
| NFR1.2 | D3 | `custody_events` — append-only by construction | probes 35–45, 95–96 |
| NFR1.3 | D1 | sidecar (model loaded once) | 597/57/57 ms |
| NFR1.4 | D1 | `worker.py` + `analysis_jobs` | kill-test drill |
| NFR1.5 | D3 | `sha256Hex` · `verify_evidence_hash` RPC | probes 46–47, 90–92 + 3 hash drills |
| NFR1.6 | D1 | `CONFIDENCE_THRESHOLD = 0.60` · `inconclusive_result` | 2 invariant drills · corpus 5/11 inconclusive |
| NFR1.7 | D4 | approval gate + NOT NULL constraints | 2 invariant drills |

## 7. Module ownership

| ID | Name | Module | What was built |
|----|------|--------|-----------------|
| D1 | Abdullah Mahmood | BPA ML sidecar | FastAPI wrapper (`/analyze`, `/explain`, `/model-card`, `/health`), model pinning by SHA-256, the worker and its retry semantics, corpus evaluation, demo strategy |
| D2 | Md Galib Mahmud Aofi | Cases & RBAC | Case lifecycle and transition RPCs, auth scaffolding, the five roles and their policies, role-filtered search RPCs, the approval-gate trigger |
| D3 | Fatin Mahtab Nahin | Evidence & Chain of Custody | Evidence registry with typed uploads, SHA-256 on ingest, EXIF capture, the append-only custody log and its chain view, the verification RPC |
| D4 | Most. Mosaddika Mim | Reporting & Notifications | PDF forensic report, notification triggers and the in-app bell, approval workflow screens |
| D5 | Farhana Yesmin | Frontend Experience | The whole operator surface: dashboard, case detail with the transition timeline, evidence register and viewer, BPA result cards, custody chain, search, responsive layout, status and notification badges |

## 8. Contract deltas, and why

Three points where the shipped system differs from the letter of the contract.
Each is stated here rather than discovered in the viva.

### 8.1 The frontend is React, not Vue (D5's module line says "Vue dashboard")

The contract names Vue. We built React 19 + TypeScript + Vite + shadcn/ui.

**Why:** the decision was taken once, early, and recorded as ADR-002 with the
reasoning that mattered — a typed component model and a component library the
whole team could read quickly. The functional requirement is a *dashboard*;
the framework is an implementation choice, and the contract's own wording for
D5 lists interface obligations (open cases, pending analyses, recent custody
activity, result cards with class + confidence + top features, badges), all of
which are delivered.

**What it would cost to switch:** the UI layer is isolated in `app/src/features`
with one module per domain and no logic in components, so a port is a
re-rendering exercise, not a rewrite — but it would be weeks, for no
requirement gain. The honest answer in the viva is: the requirement is met, the
framework deviates, here is the ADR, here is why.

### 8.2 Notifications are in-app only; there is no email dispatch

D4's module lists "email + in-app notifications". We ship in-app only: the
`notifications` table plus four triggers that create rows, surfaced by the bell
in the app shell.

**Why:** email delivery needs an SMTP provider, verified sender identities and
a retry/queue story for outbound mail — a second infrastructure dependency to
stand up in the last weeks of a capstone, with no requirement behind it (no FR
mentions email; notifications are not in the contract's functional list at
all). The in-app channel covers the actual need: a supervisor must know an
analysis is waiting for approval, and the bell tells them while they are in
the app.

**What it would take:** a `notifications.email` column plus a small worker that
claims unsent rows and posts them through a provider (Resend/SMTP), with the
outbound failures tracked in the same style as the analysis queue. Roughly a
day of work; not attempted, and not claimed.

### 8.3 The custody "graph" is rendered as a chain timeline

D3's module lists a "custody graph view". We render the chain as an ordered
timeline with actor, action, timestamp and reason — the same data, in reading
order.

**Why:** the chain is a sequence, not a graph: every event links to the
previous holder, and a timeline answers the questions a custody question
actually asks ("who held it, when, and why did it move"). A node-link diagram
of a linear chain is decoration.

**Note on the audit log:** there is no separate audit table. The append-only
`custody_events` table *is* the audit log — same rows, same guarantees, one
source of truth rather than two that could disagree.

## 9. Data model

Eight tables, all RLS-protected:

| Table | Holds | Written by |
|-------|-------|-----------|
| `profiles` | one row per account: display name, role | `handle_new_user()` trigger |
| `cases` | case number, title, description, status, assigned analyst | app + RPC |
| `case_transitions` | the lifecycle trail: from, to, actor, note, time | `transition_case_status()` only |
| `evidence` | file name, type, size, SHA-256, storage path, EXIF, uploader | app |
| `custody_events` | actor, evidence, action, reason, time — append-only | app (insert only) |
| `analyses` | verdict, confidence, probabilities, geometry, explanation, timing, model hash, status | worker + review workflow |
| `analysis_jobs` | the queue: status, attempts, last error, timestamps | worker + RPC |
| `notifications` | user, kind, payload, read marker | four DB triggers |

## 10. Known limitations

1. **No email channel** (§8.2).
2. **React, not Vue** (§8.1).
3. **The demo corpus is out-of-distribution.** The eleven photographs are
   openly-licensed Commons images used to exercise the pipeline; the model was
   trained on the Attinger/Kannan/Ferrarini research sets, so no ground-truth
   label is claimed for them, and their verdicts are the model's honest
   output — not an accuracy claim.
4. **The engine serves one model.** The pipeline is pinned by SHA-256 and the
   model card records what it is; swapping models means re-pinning and
   re-running the corpus, not a hot path.
5. **Storage objects cannot be deleted through the API** — by design, the
   evidence bucket has no DELETE policy, not even for an admin. Orphaned
   objects are removed by an administrator through a temporary, folder-scoped
   policy.
