# Viva preparation — Group 3

Capstone Lab Assessment 1 · 2026-10-20

Each member defends one module. The examiner may ask any question of any
member, so everyone must be able to answer the cross-cutting questions in §4
as well as their own module.

**How to use this document.** Read your own section until you can answer its
questions *without looking*. Then read §4 with everyone. Then run the
self-check in §6.

---

## 1. D1 — Abdullah Mahmood · BPA ML sidecar

**Your module in one sentence:** the FastAPI wrapper around the verified
pipeline, the worker that feeds it, and the model pinning that makes a result
traceable to an artefact.

### Your three questions

**Q: Walk me through what happens when an image is analysed.**
**A:** The browser's request never reaches the sidecar directly. The app
creates an `analyses` row and a queued `analysis_jobs` row; `worker.py`
polls the queue, claims one job atomically, downloads the evidence bytes
from Storage, and POSTs them to `POST /analyze` on the sidecar. The sidecar
(`sidecar/app/main.py`) decodes the image with PIL — a non-image gets a clean
`400` — and hands the bytes to `analyze_image()` in `sidecar/app/analyzer.py`:
colour segmentation in L\*a\*b\* with Otsu thresholding, connected components,
`per_stain_geometry()` for each stain's area/axes/elongation/orientation, then
`build_feature_vector()` and the CatBoost classifier. The response carries
the winning `verdict`, its `confidence`, the full `probabilities` map, the
per-stain geometry, an `explanation`, `timing_ms` and `model_sha256`. Below
`CONFIDENCE_THRESHOLD = 0.60` the verdict is `inconclusive`. The worker writes
the result into the analysis row and marks the job `done`.

**Q: How do you know a result came from the model you think it did?**
**A:** Every analysis row stores `model_sha256` — the digest of the serialised
model artefact — and the same digest is served by `GET /model-card`. The
corpus provenance table in `demo/provenance.md` carries it per result, so any
verdict can be traced back to the exact artefact that produced it.

**Q: What happens if the worker dies mid-job?**
**A:** Nothing is lost, because the queue is a table. The job row stays
`processing` with its `picked_up_at` timestamp; when a worker restarts with
`STALE_MINUTES=1`, it re-queues claims older than the stale window and
completes them. The verification drill proves it: a worker is SIGKILLed
mid-flight while its sidecar points at a TCP black hole, and a second worker
re-queues the abandoned claim and drives it to `ready_for_review` with
`attempts=0` and no lost rows. One subtlety we learned the hard way:
PostgREST applies `LIMIT` to the rows an `UPDATE` *returns*, not the rows it
*updates*, so the original one-statement claim marked the whole queue at once
and stranded 9 of 10 jobs. The worker now selects a candidate id first and
updates that id with a `status='pending'` guard.

### Must answer cold

1. What is your threshold and why 0.60, and what happens under it?
2. What exactly does the explanation contain, and why is it not SHAP?
3. Your measured latency, and against which budget?

### The trap in your module

`GET /explain` returns the **last** explanation the sidecar produced — a
module-level global, for convenience during demos. It is not concurrency-safe
and it is not how the app works: the app persists the explanation on the
analysis row and renders that. Say so plainly if you are asked; it is a
convenience endpoint, not the production path.

---

## 2. D2 — Md Galib Mahmud Aofi · Cases & RBAC

**Your module in one sentence:** the case lifecycle, the five roles, and the
policy layer that makes the role rules true regardless of what the interface
offers.

### Your three questions

**Q: How are the five roles defined, and where is the permission decision
made?**
**A:** `profiles.role` is a text column with a CHECK constraint limiting it to
`admin`, `lead_investigator`, `analyst`, `reviewer`, `viewer`. A new signup
defaults to `viewer` through the `handle_new_user()` trigger. The permission
decision itself is never made in application code — it is Row Level Security
on the tables. The UI hides what a role may not do, but that is cosmetic; the
API refuses it, and that refusal is what the 100 probes measure.

**Q: How do case transitions work, and can they be skipped?**
**A:** `transition_case_status()` is a `SECURITY DEFINER` RPC: it validates
the move against `next_case_status()` (open → investigate → review → closed,
and no jumping), writes the `case_transitions` row with the acting user and a
note, and updates the case — all in one transaction, so the trail and the
status can never disagree. Clients never update `cases.status` directly.

**Q: How is search filtered by role?**
**A:** `search_cases()` and `search_evidence()` are **SECURITY INVOKER**, over
maintained `tsvector` columns refreshed by triggers and normalised through
`search_norm()` so case and description match case-insensitively. Because the
functions run with the caller's permissions, RLS filters the candidate rows
before they are ranked: an analyst's results contain only cases assigned to
them, and an evidence hit whose case the caller may not read is dropped
rather than shown blind.

### Must answer cold

1. Why SECURITY INVOKER for search and SECURITY DEFINER for the transition RPC?
2. What happens to a search hit whose case the user cannot see?
3. Which of your policies are the strictest, and why that one?

### The trap in your module

`current_role()` had to be rewritten non-recursively — a policy that calls a
function which queries the same table recurses until Postgres refuses. It is
a small thing but a classic one, and worth naming as something you hit.

---

## 3. D3 — Fatin Mahtab Nahin · Evidence & Chain of Custody

**Your module in one sentence:** every byte that enters the system is hashed
before it is stored, and every hand-off is a row nobody can edit.

### Your three questions

**Q: How does the evidence integrity chain work?**
**A:** Three points of comparison. (1) The browser hashes the file with Web
Crypto (`sha256Hex()`) before upload. (2) That digest is stored on the
`evidence` row together with the size, type, EXIF summary and uploader.
(3) The verification path downloads the stored object and re-hashes it, and
the `verify_evidence_hash()` RPC compares the recomputed digest with the
stored one server-side. The probes check all three agree — that is NFR1.5's
"100% of verification requests".

**Q: Why can nobody edit the custody log?**
**A:** Because there is nothing to allow: `custody_events` has **no UPDATE
policy and no DELETE policy at all** — not for a lead, not for an admin. The
only verb the table has is INSERT. The probes attempt PATCH and DELETE as
admin, lead and reviewer, and every attempt is refused by Postgres. The
storage bucket is the same idea: no overwrite path, and the evidence table's
own RLS — not the bucket — is the real gate on reading.

**Q: What is in a custody event?**
**A:** Actor, evidence item, action (`collected`, `transferred`, `received`,
`sealed`, `released`), timestamp and a free-text reason — "who, what, when,
why", exactly as the requirement puts it. The app offers no edit or delete
affordance, because the database would refuse it anyway.

### Must answer cold

1. Where exactly is the hash computed, and why client-side *and* server-side?
2. Why does the custody table have no UPDATE policy rather than a restrictive one?
3. What does EXIF capture add, and what happens for an image without it?

### The trap in your module

Your earlier custody policy reached rows through a join to `cases` — and a
policy's reach is evaluated with the *caller's* permissions, so an analyst
could not see custody for a case they were not assigned to, and because the
client asks for the inserted row back, the insert was rejected as well. The
fix (migration `20261020030000`) grants the staff clause first; probes 95/96
fail on the old policy and pass on the new one.

---

## 4. D4 — Most. Mosaddika Mim · Reporting & Notifications

**Your module in one sentence:** the document that leaves the system, and the
signals that tell a person something needs them.

### Your three questions

**Q: What is in the PDF report, and how is it assembled?**
**A:** `app/src/features/reports/report-document.tsx` with
`@react-pdf/renderer`: the case header (number, title, status, notes), the
evidence table (name, type, size, SHA-256), the custody chain with actor
names, the analysis findings (verdict, confidence, timing, model hash,
explanation) and the approval decision. Actor names come from the
`case_actor_names()` RPC rather than a direct join on `profiles` — so a
report can name the actors on a case the caller may not be able to read in
full, without the report query itself being blocked by RLS.

**Q: How do notifications work?**
**A:** Database triggers, not application code: `notify_case_assignment()`,
`notify_analysis_assignment()`, `notify_analysis_status()` and
`notify_custody_transfer()` write rows into `notifications` for the relevant
user, and the bell in the app shell reads them. The triggers matter because
the events that matter (a case being assigned, an analysis finishing) happen
in the database, and a trigger cannot be bypassed by an API caller.

**Q: What is the approval workflow, and where is it enforced?**
**A:** An analysis moves `ready_for_review → approved | rejected` through
`reviewAnalysis()`, and only a reviewer or supervisor may do it — the
requester and the analyst cannot approve their own work. The database
enforces the finality: the `forbid_result_rewrite()` trigger rejects any
update that would change a finalized result, so an approved analysis cannot be
quietly re-written.

### Must answer cold

1. Why are the notifications triggers rather than calls from the app?
2. What happens when a supervisor rejects — and why must a reason be given?
3. Why does the report query use an RPC instead of joining `profiles`?

### The trap in your module

Your module description says "email **+** in-app notifications". We ship
**in-app only** — there is no SMTP provider, no outbound queue, no email
address column on the table. Say so directly, with the reason (an email
provider is a second infrastructure dependency for a capability no functional
requirement asks for) and the cost (about a day: an `email` column plus a
small worker that claims unsent rows and posts them through a provider).
Over-claiming here would be the worst possible answer.

---

## 5. D5 — Farhana Yesmin · Frontend Experience

**Your module in one sentence:** the operator's surface — seven screens, one
folder per domain, and no business logic in the components.

### Your three questions

**Q: Why is the frontend React when the brief says Vue?**
**A:** The contract specifies the dashboard's *contents* — open cases, pending
analyses, recent custody activity, evidence viewer, result cards with class +
confidence + top features, responsive layout, status and notification badges —
and all of that is delivered. ADR-002 records the framework decision and the
reasoning (typed components, a component library the whole team could read
quickly, and the dismissal of the offline-demo constraint that had driven the
original Laravel/Vue choice). The UI layer is isolated under
`app/src/features`, one folder per domain, with no logic in components, so a
port would be a re-rendering exercise rather than a rewrite — but it would
cost weeks and buy no requirement. I would rather say this plainly than
pretend the brief said React.

**Q: How is the front end organised?**
**A:** `app/src/features/<domain>/` — one folder per domain (auth, cases,
evidence, custody, analyses, notifications, reports, search, dashboard), each
with its data-access module (`*.ts`, every database call the feature makes)
and its components. The rule: components render, data modules fetch. That
keeps the RLS story honest — the UI never filters by role, it asks the
database and renders what it is given.

**Q: What did you test, and what did you not?**
**A:** Two behavioural tests (Vitest + Testing Library, no network, Supabase
mocked): one that the session hook reports "not loading" on the first render
when the client is unconfigured, and one that switching evidence items never
shows the previous item's custody chain while the next one loads. Both were
drilled — reverting the fix fails them. Honestly: two tests are thin. The
suite is the smallest thing that protects the two bugs lint caught, and it
should grow.

### Must answer cold

1. Why one folder per domain, and where does every database call live?
2. How does the UI know what to show, if it does not check roles?
3. Which two bugs do the tests protect, and how do you know they work?

### The trap in your module

The demo's dropdown of evidence items is populated asynchronously. The first
recording script waited for the *second* option to exist and then read the
list — so the video showed a verification fixture instead of a corpus item.
The fix was to wait for the corpus case to appear in the options, not for a
count. Say it if asked: it is a good example of "the recorder was lying to
us", and it is why the video is generated rather than hand-shot.

---

## 6. Cross-cutting questions (everyone should be able to answer these)

**Q: What is your architecture in one breath?**
"A React operator interface over a Postgres system of record whose Row Level
Security *is* the permission model, plus a stateless FastAPI sidecar that
turns an image into a verdict, plus a worker that feeds the sidecar from a
job table."

**Q: Why Postgres and not a NoSQL store or a document DB?**
"Three reasons, all requirement-driven: RLS gives us authorization in the
database, which is the whole security model; append-only tables with triggers
give us the custody log and the notification fan-out for free; and the
requirement for full-text search over cases and evidence is a solved problem
here — `tsvector` columns with ranked `ts_rank` — instead of a bolt-on."

**Q: How did you test the authorization?**
"100 live probes. Five personas, and each of them attempts both the allowed
and the forbidden operation on every table, both RPC families, Storage and the
job queue. The denials are observed as PostgREST `42501`, an empty result, or
a Storage `403`. It runs against the live database, because RLS behaviour is
a property of Postgres."

**Q: What is the most interesting bug you found?**
"The worker's claim. PostgREST applies `LIMIT` to the rows an `UPDATE`
returns, not the rows it updates — so `UPDATE ... SET status='processing'
WHERE status='pending' LIMIT 1` marked the entire queue in one statement and
stranded nine of ten jobs. The demo corpus surfaced it: eleven jobs queued,
one processed, ten stuck."

**Q: What would you do next, with more time?**
"Three things, in order: grow the behavioural test suite from two tests to a
proper layer, because the UI is where the next defect will live; implement
the email notification channel the brief mentions; and write a benchmark that
measures the model against a labelled test set, because right now our accuracy
claims are the paper's, not ours."

**Q: What did you *not* do?**
"The email channel (out of scope by time, not by design), a node-link custody
graph (the chain is linear, so a timeline says more), and a Vue front end (the
stack decision, ADR-002). All three are in the SRS's deltas section, so they
are on the record rather than hidden."

**Q: Where is your evidence?**
"`verification/` — the 100-probe RBAC matrix and the 21 engine drills, with
their reports under `verification/results/`, plus the corpus provenance table
in `demo/provenance.md` and the SRS's traceability matrix. Everything in the
viva claim can be re-run in about four minutes."

## 7. If you do not know

Say so, in one sentence, then say what you would do:

> "I don't know the exact number off the top of my head — I'd check the
> probe report rather than guess. What I do know is the mechanism: the answer
> is enforced by an RLS policy, and the probe that proves it is in the matrix."

Guessing is the only unforgivable answer. Every other gap is survivable.

## 8. Self-check, 10 minutes before the viva

- [ ] Every member can state their module in one sentence.
- [ ] Every member can name one probe number that proves their requirement.
- [ ] The analyst can describe the kill-test without notes.
- [ ] Someone can say what happens when the sidecar is down (cached results).
- [ ] Everyone knows the two deltas (React not Vue, no email) and says them
      the same way.
- [ ] The reports are open in a tab: `verification/results/rbac-latest.md`,
      `verification/results/engine-drills-latest.md`, `demo/provenance.md`.
