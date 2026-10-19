# Hemospot — Code Standards

**Rule zero: this code must be explainable out loud.** If a teammate cannot read a file once
and describe what it does, the file is wrong — regardless of whether it works. Readability
outranks cleverness, brevity, and "looking like a real app". This applies to every file we
write: React components, SQL policies, Python sidecar code, scripts, tests.

A supervisor will ask "explain this". The answer should be a sentence about the *problem*,
not a tour of abstractions.

---

## 1. The rules, concretely

**Naming**
- Names state the domain thing and the action: `listOpenCasesForAnalyst`, `recordCustodyTransfer`,
  `hashEvidenceFile`. Never `getData`, `handleStuff`, `process()`, `thing`, `temp`.
- Domain words only as abbreviations: `BPA`, `RLS`, `SHA-256`, `FR1.4`, `NFR1.5`. Everything else
  is spelled out. No `usr`, `evd`, `cfg`, `mgr`, `svc`.
- Booleans read as assertions: `isApproved`, `canPublishReport` — not `flag`, `status2`.

**Size and shape**
- Functions do one thing, ≤ ~40 lines, early returns instead of nested `if`s.
- Files ≤ ~300 lines. When a file grows past that, it is doing two jobs; split by job and name
  each half after its job.
- Depth ≤ 3. If you need a fourth level, extract a named function.

**Structure**
- One module per domain concept: `cases.ts`, `evidence.ts`, `custody.ts`, `analyses.ts`.
  No `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts` — a name that describes nothing hides everything.
- No barrel files (`index.ts` re-exporting everything). Import from the file where the thing lives,
  so a reader can follow one hop to the definition.
- Predictable layout, documented in the README: `development/app/src/features/<concept>/`,
  `development/supabase/migrations/`, `development/sidecar/app/`.

**Abstraction**
- No speculative abstraction. Write the second occurrence plainly; extract only on the third.
- No custom hook that wraps two lines. No generic factory, no base class, no plugin registry,
  no dependency-injection container, no metaprogramming (decorators that rewrite behaviour,
  dynamic property access, `eval`-adjacent tricks).
- Three similar lines beat a clever helper. Duplication is cheaper to read than indirection.
- Every dependency must be justifiable in one sentence. Nothing arrives "because it's standard".

**Comments**
- Every non-obvious module opens with 3–5 lines: what it is, and which requirement it serves
  (`FR1.3 evidence ingest`, `NFR1.2 RBAC denial`). This makes the FR/NFR mapping traceable
  straight from the code — which is exactly what gets graded.
- Comments explain **why**, never what the next line plainly says. `// increment i` is noise.
- No commented-out code, no `TODO` without an issue reference.

**Security and data rules stay visible**
- RLS policies are committed as plain, readable SQL, one policy per file, named after the rule
  (`analyst_reads_assigned_cases.sql`). Anyone should be able to read the permission model without
  reading application code.
- Prefer explicit queries over ORM/query-builder magic, so the rule is legible in the code that
  applies it. If a query needs a comment to explain what it filters, rewrite the query.
- Never hide an error. No empty `catch`. Failures surface to the user as a real state
  ("analysis pending", "not permitted"), never as a silent no-op.

**Types**
- TypeScript `strict` on. Explicit types on every function signature. No `any`; `unknown` plus a
  narrow is the honest version. No `as` casts to silence the compiler.
- Python: type hints on public functions, no `*args/**kwargs` bag-passing.

**Tests read as requirements**
- Test names are sentences about behaviour: `"analyst cannot read a case they are not assigned to"`.
  The suite should read as the FR/NFR list in executable form.
- Test the real interface the user uses, not internals.

**Performance**
- No optimisation without a measurement. No caching, memoisation, or concurrency tricks until a
  number shows they are needed, and the number goes in the commit message.

**Errors and state in the UI**
- Explicit states — loading, empty, error, denied — written out. No spinner that means "something".

---

## 2. Why these and not others

The measurable NFRs (100% RBAC denial, 100% append-only custody log, hashes match on 100% of
verifications, ≤5s per image) are *claims about behaviour*. They are provable by reading plain
code plus a suite that names each claim. Every rule above exists to keep that provability:
abstraction and magic destroy it, verbosity does not.

## 3. Review checklist (one line each, used before calling anything done)

1. Can I explain this file out loud in one sentence?
2. Does every name state a domain thing and an action?
3. Is any file doing two jobs, or over ~300 lines?
4. Did I introduce an abstraction that exists only once?
5. Does each module header name the FR/NFR it serves?
6. Are the RLS rules readable as SQL, not buried in app code?
7. Does any `catch` swallow something?
8. Is there an unmeasured optimisation here?

---

*Status: proposed default conventions, in effect for all code written from here. Correct any
line that does not match what you want — this file is meant to be argued with, not admired.*
