# Methodology — how Hemospot was built and how it is proven

Group 3 · BBA/DIU · Capstone Lab Assessment 1 · 2026-10-20

This document answers the question a viva examiner asks second: *how did you
know it works?* It describes the engineering method, the decisions that shaped
it, and — just as importantly — the defects that the method actually caught.

---

## 1. The shape of the work

The project ran as a chain of decisions, each one explicit and dated:

```
contract (PDF)
  → feasibility review of the research pipeline        (002)
  → public dataset reconnaissance                      (003)
  → inference-environment decision                    (004)
  → questions to the teacher                          (005)
  → final FR/NFR contract                             (006)
  → WBS sketch                                       (007)
  → stack decision ADR-002 (React + Supabase + sidecar)
  → execution plan, re-baselined into tracer tickets   (BPA_PROJECT_PLAN.md)
  → build → verify → fix → re-verify (per ticket)
  → SRS + methodology + rehearsal + viva sheets        (this folder)
```

Two properties of this chain are worth defending in the viva:

**The contract came first.** The FR/NFR set in the assessment PDF was treated
as the specification from day one, not as a document to write at the end. Every
implementation ticket named the requirement it served, and the SRS
(`docs/SRS.md`) traces each requirement to the code and the probe that proves
it. No requirement was quietly reinterpreted; where the shipped system differs
from the letter of the contract, the difference is written down in SRS §8
rather than left for an examiner to discover.

**The plan was sliced vertically, not by layer.** The WBS was drawn as tracer
bullets — each one an end-to-end slice through the stack that could be
demonstrated, not "build the database first, then the API, then the UI". The
first slices were the ones the examiners would press: create a case, register
evidence with a hash, record a custody event, classify one photograph, produce
one PDF.

## 2. Architecture decisions

### 2.1 The stack (ADR-002)

ADR-001 chose Laravel + Livewire on the strength of one constraint: the demo
had to run on an old lab PC without internet. That constraint was **explicitly
dismissed by decision** — the demo may use campus Wi-Fi or a phone hotspot,
and cached results in Postgres are the fallback. Once that changed, ADR-002
superseded it with React 19 + Vite + TypeScript + shadcn/ui on Supabase, plus a
stateless FastAPI sidecar for the engine.

Two consequences that shaped the code:

- **The sidecar is stateless.** It turns an image into a JSON verdict and
  nothing else; it never touches the database. All persistence lives in
  Postgres, which keeps the engine horizontally replaceable and makes the
  "swap the model" question a deployment detail rather than a redesign.
- **The demo has a fallback by construction.** Because the corpus results are
  cached rows in Postgres, a dead sidecar degrades the demo to "read the
  stored verdict" instead of "watch it fail".

### 2.2 Authorization lives only in the database

There is no role check in application code. Every table carries Row Level
Security policies, and the application is written as if the user could be
anyone — because with RLS, the user *is* anyone, and Postgres decides.

The reason is auditability rather than elegance: the question "who could see
this case?" then has exactly one answer, and it is the answer the database
gives, testable with a probe. A role check in a React component is a
suggestion; a role check in a policy is a fact.

This decision paid for itself twice — see §5.1 and §5.2, where the RLS model
caught defects that no amount of UI testing would have.

### 2.3 The queue is a table

`analysis_jobs` is an ordinary Postgres table, not a broker. A job a worker
claimed and then died on is still a row, so "no work is lost" is a property of
the data model rather than of a broker's delivery guarantees. Claims are made
by `UPDATE ... WHERE id = <candidate> AND status = 'pending'`, with the
candidate selected first — because PostgREST applies `LIMIT` to the rows an
update *returns*, not the rows it *updates* (§5.3).

### 2.4 Schema changes are append-only migrations

Twenty-one numbered migrations, no destructive changes, no column drops, and
every one of them replayable against the live project. DDL was applied through
the Supabase Management API with the CLI's token — no database password is
held in this repository, and the same path allows any provisioning script to be
rehearsed inside `BEGIN; ... ROLLBACK;` before it is ever committed.

## 3. Verification as the core practice

The single organizing idea of this project: **a requirement that cannot be
executed is not verified.** So every FR and every NFR was turned into
something that runs and passes or fails.

### 3.1 The three layers

| Layer | What it is | Where | What it can catch |
|-------|-----------|-------|------------------|
| Behavioural tests | Vitest + Testing Library, no network | `app/src/**/*.test.ts(x)` | Component logic, hook lifecycle, the "previous item's data lingers" class of bug |
| Probe matrix | 100 live REST/Storage/RPC probes as 5 personas | `verification/rbac-matrix.ps1` | Authorization (NFR1.1), append-only custody (NFR1.2), hash integrity (NFR1.5), routing/approval (FR1.7), search filtering (FR1.9) |
| Engine drills | 21 checks against the real sidecar and worker | `verification/engine-drills.ps1` | Latency (NFR1.3), worker failure and retry (NFR1.4), field invariants and the inconclusive path (NFR1.6/1.7) |

The probe matrix runs against the **live** database, not a mock or a local
Postgres. That is deliberate: RLS behaviour, trigger behaviour and RPC
security are properties of Postgres, and a mock proves nothing about them. It
is also why the matrix is idempotent — it applies fenced fixtures with
reserved UUIDs and tears down after itself.

### 3.2 The drill rule

Every fix was accompanied by a check that **fails without it**. Not a test
that passes today — a test that was seen to fail against the broken code
first. Examples from this project's history:

| Defect | The drill |
|--------|-----------|
| Worker claimed the whole queue in one statement | Reverting the worker to `UPDATE ... LIMIT 1` strands 9 of 10 jobs; the drill counts claimed jobs |
| Custody invisible to unassigned analysts | Probe 95 returns `HTTP 200 []` on the old policy; probe 96 returns `HTTP 403` on the insert |
| UI showed the previous evidence's chain during a load | Reverting the id guard makes the test render the stale chain |
| Corpus images were Wikimedia error pages | The byte check (magic number + size) rejects the 2 KB HTML page and re-fetches |

This rule costs more time up front and buys the only thing that matters in a
viva: the ability to say "this test fails without this fix" and have it be
true.

### 3.3 Continuous integration

Every push runs three jobs: typecheck + lint + build, the Vitest suite, and
the sidecar's smoke test. They are fast and they are boring, which is the
point — a red pipeline stops the work, so nobody is tempted to push a broken
state and fix it later. All three have been green on every commit since the
harness was introduced.

## 4. Defects the method caught (the honest part)

These are real bugs this project found in its own code. They are listed
because "we found and fixed N bugs" is only credible when the bugs are
named.

| # | Defect | How it was found | Fix |
|---|--------|------------------|-----|
| 1 | The worker marked **all** pending jobs `processing` in one statement — 9 of 10 jobs stranded forever | The corpus build: 11 jobs, 1 processed, 10 stuck | Select the candidate id first, then `UPDATE ... WHERE id = <id> AND status='pending'` (PostgREST's `LIMIT` caps returned rows, not updated rows) |
| 2 | An analyst could not read or write the chain of custody of a case they were not assigned to | The demo rehearsal — "Record a handoff" failed for the analyst | The policy reached rows through a join to `cases`, and a policy's reach is evaluated with the *caller's* permissions. Migration `20261020030000` grants the staff clause first; probes 95/96 lock it in |
| 3 | Seeded accounts could not sign in — `HTTP 500 Database error querying schema` | A throwaway login test (SQL checks could not see it) | GoTrue scans eight token columns as plain Go strings: they must be `''`, never `NULL` |
| 4 | The corpus images were HTML error pages stored as JPEG | Magic-byte validation on every download | Validate bytes, retry with a growing pause, delete what fails |
| 5 | A JSON array parsed as one element, so a loop ran once over eleven rows | The provenance file listed one row instead of eleven | `@($body | ConvertFrom-Json)` collapses arrays in PowerShell 5.1 — assign first, wrap after |
| 6 | A policy that granted read access could still block a write, because `Prefer: return=representation` re-checks the SELECT policy on `RETURNING` | The "new row violates row-level security policy" error on insert | Known Postgres behaviour; the fix is to grant the read the caller is entitled to |
| 7 | `current_role()` recursed into itself | A permission-denied error on the first probe run | A non-recursive implementation, in its own migration |

Defects 1, 2, 6 and 7 are the ones that matter for the viva: they are all
subtle interactions between Postgres semantics and application code, and none
of them would have been caught by clicking through the UI.

## 5. Testing layers and their limits

| Claim | Covered by | Not covered by |
|-------|-----------|----------------|
| "A viewer cannot see a case in review" | Probe matrix (live RLS) | The UI, which merely hides the link |
| "The custody log cannot be edited" | Probes (no UPDATE/DELETE policy) + schema review | Any future migration that adds one — the review checklist catches it |
| "Analysis completes in ≤ 5 s" | Engine drill timing samples | A cold model load on a machine slower than the reference laptop |
| "No job is lost when a worker dies" | The kill-test drill | Killing the worker between two unrelated transactions |
| "The UI does not show stale data" | The two Vitest tests | Every other component — the suite is deliberately small and will grow |

We state these limits in the open rather than pretending the coverage is
total. The verification suite is strong where the contract makes strong claims
(authorization, custody, hashes) and thin where the contract is qualitative
(interface quality).

## 6. Secrets and configuration discipline

- No secret is committed. The app reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` from the environment; the sidecar reads
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, the worker password and the model
  directory from `sidecar/.env`, which is git-ignored.
- The anon key is public by design — it is the *anon* key, and RLS is what
  protects the data. There is no `service_role` key anywhere in the project;
  account enumeration is possible only through `public.profiles`, which holds
  exactly one row per account and has no delete policy.
- The model is pinned by SHA-256 (`model_sha256` on every analysis row) and
  the digest is served by `/model-card`, so a result can always be traced to
  the artefact that produced it.
- Database DDL was applied through the Management API using the Supabase CLI
  token; the database password was never needed, and is not stored.

## 7. Honest limitations of the method

1. **The probe suite depends on the live database.** It is idempotent, but a
   schema change can still break probes in ways a reviewer must read rather
   than trust.
2. **The Vitest suite is thin.** Two behavioural tests protect the two bugs
   lint caught. Every future component needs a test to keep it honest.
3. **Timing numbers are machine-specific.** NFR1.3 is measured on this
   machine; the reference-laptop claim is an extrapolation, and we say so.
4. **The corpus is out-of-distribution.** Eleven Commons photographs exercise
   the pipeline; they do not measure accuracy, and no accuracy number is
   claimed anywhere in this project.

## 8. What we would do differently

- **Write the probe suite before the third feature.** We wrote it after T-016,
  and by then it had to be reconstructed from work that was already done —
  which is exactly when probes get written to match behaviour instead of
  intent.
- **Version the schema and the suite together.** A migration that changes a
  policy should carry the probe that proves the new behaviour, in the same
  commit — the way probes 95/96 travel with the custody migration.
- **Test the media pipeline.** The corpus builder spent more time fighting
  Wikimedia rate limits than the model spent classifying images. A one-line
  content-type check at the fetcher's edge would have caught the HTML-as-JPEG
  class of bug immediately.
