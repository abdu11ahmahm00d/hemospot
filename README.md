<p align="center">
  <a href="#about">About</a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#architecture">Architecture</a>
  ·
  <a href="#installation">Installation</a>
  ·
  <a href="#issues-bugs-and-feature-requests">Issues</a>
</p>

<h1 align="center">Hemospot</h1>

<p align="center">Forensic case management with bloodstain pattern analysis.</p>

## About

Bloodstain pattern analysis is decisive in shooting investigations. The case around it rarely is. Evidence custody lives on paper and in chat logs, so it cannot be trusted to survive a courtroom. Analysts need a defensible read on every stain. Leadership needs to know where each case actually stands without asking anyone.

Hemospot is a forensic case workspace that keeps the photograph, the custody handoff, and the stain verdict inside one auditable record.

**Cases, evidence, custody, analysis, and reporting live in one place, so the case file assembles itself.** Permissions are enforced in the database rather than in the interface, evidence files are hash pinned at the moment of upload, and no verdict reaches a report without a named human approving it.

**The bloodstain engine returns a label, a calibrated confidence, and an explanation built from measured values, or it returns inconclusive.** A result is never presented as definitive without the numbers behind it.

## Features

**Cases with a recorded lifecycle.** Every case opens with a unique reference, a title, and a description. Every transition is written with its actor and its timestamp, so the timeline is a record rather than a rendering of one.

**Evidence pinned by hash.** A file is hashed in the browser with Web Crypto at upload, before it reaches storage. Recomputing the hash on demand is a verification step, and it matches.

**A chain of custody that cannot be rewritten.** The custody log is append only, and the table has no update policy and no delete policy in the database. That absence is the proof. Every entry carries who, what, when, and why.

**Detection and classification.** The engine finds individual stains in a scene photograph, measures thirty features per image (origin, convergence axis, spread, gaps between neighbours, shape solidity, and the rest), and classifies the pattern into one of three classes: gunshot, impact, or low velocity, with a confidence for each.

**Nothing finalizes without a human.** An investigator requests an analysis, an administrator routes it to a named analyst, the analyst runs it, and a supervisor approves or rejects with a mandatory note on rejection. Only an approved analysis reaches the report.

**Search filtered by permission.** Full text search across cases and evidence metadata, filtered by the permissions of whoever is asking. An analyst who is not on a case cannot find that case, because the filter is the database's rather than the interface's.

**A PDF forensic report in one click.** Evidence metadata with hashes, the custody log, every finding with confidence and explanation, and the approval record, rendered as a deep linkable page so the report URL can go straight into a case note.

**In app notifications.** Assignments, routing, verdicts ready for review, decisions, and custody transfers all raise badges. Database triggers raise them, so nobody can forge one.

**Retries to completion.** Analyses run through a durable queue. A worker that dies mid job has its claim swept back to pending, and the job runs again until it finishes or exhausts its attempts.

**Runs without the engine.** The workspace never depends on the analysis service. If the sidecar is down, the case still opens and its analysis simply reads pending. Machine learning is an enrichment here, not a dependency of the case file.

## Architecture

**The workspace is React 19, Vite, TypeScript, and shadcn/ui,** talking to Supabase for Postgres, Auth, Storage, and row level security. The interface never decides what a user is allowed to see.

**The permission model is the database itself.** Five roles (admin, lead investigator, analyst, reviewer, viewer) are enforced by row level security policies on every table. Authorization does not exist in application code, so there is no code path that can bypass it, and search runs as an INVOKER function so the caller's own policies filter every row it returns.

**The bloodstain engine is a stateless FastAPI sidecar.** An image goes in, and a verdict, a confidence, per stain geometry, an explanation, the timing, and the SHA-256 of the model that produced it come out. It holds no database connection and no state.

**The queue worker holds no service key.** It signs in as an ordinary analyst account and obeys the same policies as every human analyst, so a bug in the worker cannot grant it more access than a person has.

## Installation

Three processes on one machine: the workspace, the engine API, and the queue worker.

```bash
# Create the Supabase project in the dashboard (free tier), then link it once:
supabase link --project-ref <your-project-ref>     # prompts for the database password

# Apply the schema: tables, functions, triggers, and row level security policies
supabase db push

# Optional: one demo account per persona (set seed_password in supabase/seed.sql first)
supabase db query --linked -f supabase/seed.sql

# Regenerate the typed client whenever the schema changes
supabase gen types typescript --linked > app/src/lib/database.types.ts

# Configure the workspace
cp app/.env.example app/.env                        # Supabase URL, anon key, sidecar URL

# Terminal A: the workspace
cd app && npm install && npm run dev                # http://127.0.0.1:5173

# Terminal B: the engine API
cd sidecar && pip install -r requirements.txt
uvicorn main:app --app-dir app --port 8000

# Terminal C: the queue worker
cp sidecar/.env.example sidecar/.env                # plus an analyst service account
python worker.py
```

The workspace is at `app/`, the engine at `sidecar/`, and the schema with its policies at `supabase/migrations/`.

## Issues, Bugs, and Feature Requests

Please [search the open issues](https://github.com/abdu11ahmahm00d/hemospot/issues?q=is%3Aissue+is%3Aopen) for your bug, including any workaround you have already found, before filing a new one. If nothing matches, [open an issue](https://github.com/abdu11ahmahm00d/hemospot/issues/new/choose) and fill in the template so it can be reproduced and tracked.

## Support and Questions

1. `README.md` and `sidecar/README.md` cover running the system and the engine contract.
2. The permission model is the schema itself: every policy in `supabase/migrations/` names the requirement it enforces.
3. The [issues tracker](https://github.com/abdu11ahmahm00d/hemospot/issues) is the right place for questions other people will hit too.

## Open Source Dependencies

**Interface.** [React](https://react.dev), [Vite](https://vite.dev), [TypeScript](https://www.typescriptlang.org), [Tailwind CSS](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com), [Lucide](https://lucide.dev), [React Router](https://reactrouter.com), and [exifr](https://github.com/MikeKovarik/exifr) for reading capture metadata off the photograph itself.

**Data and permissions.** [Supabase](https://supabase.com) provides Postgres, Auth, Storage, and row level security. Case and evidence search uses Postgres full text search.

**Reports.** [@react-pdf/renderer](https://react-pdf.org), with the report written as a React component tree rather than a template.

**Analysis.** [FastAPI](https://fastapi.tiangolo.com), [OpenCV](https://opencv.org), [CatBoost](https://catboost.ai), [scikit-learn](https://scikit-learn.org), [NumPy](https://numpy.org), and [Pillow](https://python-pillow.org).

**Hashing.** Web Crypto `crypto.subtle.digest` in the browser for evidence SHA-256. No library, no server round trip.