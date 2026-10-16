# Hemospot — Forensic Case Management Platform with Bloodstain Pattern Analysis

Capstone project (SE 331, Group 3, Fall 2026). React platform + FastAPI ML sidecar.

**Planning lives in this folder** (`BPA_PROJECT_PLAN.md` is the plan of record;
`ADR-002-STACK-REACT-SUPABASE.md` is the stack decision). **Code lives beside it:**
`app/` is the React website, `sidecar/` is the BPA engine, `supabase/` is the schema
and its row-level-security policies.

---

## Run it (three processes, one machine)

```bash
# 1. Create the Supabase project (dashboard, free tier), then link it once:
supabase link --project-ref <your-project-ref>   # prompts for the DB password

# 2. Apply the schema (tables + RLS policies):
supabase db push

# 3. Typed client for the app (regenerate whenever the schema changes):
supabase gen types typescript --linked > app/src/lib/database.types.ts

# 2. Copy app/.env.example to app/.env and fill in your Supabase URL + anon key
cp app/.env.example app/.env

# 3. Terminal A — the React app
cd app && npm install && npm run dev          # http://127.0.0.1:5173

# 4. Terminal B — the BPA engine
cd sidecar && pip install -r requirements.txt
uvicorn main:app --app-dir app --port 8000    # sidecar README has details
```

| Piece | What | Where |
|---|---|---|
| React app | every screen a user sees; shadcn/ui components, supabase-js client | `app/` |
| BPA sidecar | image in, verdict + confidence + explanation out (stateless, no DB) | `sidecar/` |
| Supabase | Postgres + Auth + Storage + RLS (the permission model) | `supabase/migrations/` |

The platform **runs without the sidecar** — an analysis just shows "pending". That is
deliberate: the ML module is an enrichment, never a dependency of the case file.

## Who owns what (from Lab Assessment 1)

| ID | Name | Module | Code |
|---|---|---|---|
| D1 | Abdullah Mahmood | BPA ML sidecar — `/analyze`, `/explain`, model versioning + SHA-256, demo corpus | `sidecar/app/*` (not `stain_detection.py`, `feature_extraction.py` — those are verbatim research code) |
| D2 | Md Galib Mahmud Aofi | Cases + RBAC — case CRUD, lifecycle transitions, timeline, auth, 5 roles | `app/src/features/cases/`, `app/src/features/search/`, `supabase/migrations/0001_init.sql` (cases half) |
| D3 | Fatin Mahtab Nahin | Evidence + chain of custody — uploads, SHA-256 ingest, EXIF, append-only custody log, audit | `app/src/features/evidence/`, `app/src/features/custody/` |
| D4 | Most. Mosaddika Mim | Reporting + notifications — PDF forensic report, templates, approval screens | `app/src/features/reports/`, `app/src/features/analyses/` (approval half) |
| D5 | Farhana Yesmin | Frontend experience — dashboard, evidence viewer, result cards, responsive layout | `app/src/features/dashboard/`, `app/src/components/` |

## The rules of this codebase (`CODE_STANDARDS.md` is the full contract)

1. Every file opens with a comment naming what it does and which FR/NFR it serves.
2. Names state domain + action: `recordCustodyTransfer`, not `handleStuff`.
3. One module per domain concept — no `utils.ts`, no barrel files.
4. Authorization lives in `supabase/migrations/*.sql` RLS, never in app code.
5. The append-only custody log has **no UPDATE/DELETE policy on purpose** — that absence
   is the FR1.4/NFR1.2 proof.
6. A missing Supabase `.env` shows a banner. Errors surface; no empty `catch`.

## Weekly cadence

Each week ends with a demoable increment (plan §7 of `BPA_PROJECT_PLAN.md`) and a
one-paragraph report to sir: what we built, what we learned, what's next.
