# Hemospot web app (D2–D5's codebase, D1 owns the seam to the sidecar)

React 19 + Vite + TypeScript + shadcn/ui + Supabase. See `../README.md` for the repo map
and the module contract — this file is just how to run it.

```bash
cp .env.example .env   # then fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # http://127.0.0.1:5173
```

- `npm run build` — typecheck + production build (what gets submitted).
- `npm run lint` — what CI gates on (`oxlint --deny-warnings`, so a warning fails the
  job). Run it before opening a pull request.
- `npm test` — vitest, offline: two behavioural regression tests (chain isolation on the
  custody view, session loading with no configured client). Supabase is mocked in both,
  so no `.env` and no network are needed.
- `../supabase/migrations/` is the schema, in timestamp order. Apply the files oldest
  first in the Supabase SQL editor (or `npx supabase db push` from `../supabase/`), then
  `../supabase/seed.sql` for one demo account per persona, then sign in. Without the seed,
  the signup trigger creates every new account with role `viewer`, which every policy
  denies, so promote the first one from the SQL editor:
  `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');`

## Layout

```
src/
  App.tsx                  routes + auth gate
  components/app-shell.tsx sidebar navigation (the signed-in frame)
  components/ui/           shadcn/ui source (button, card, input, badge, table)
  features/<module>/       one folder per module, one page per module so far
  features/auth/           login page + session hook (Supabase Auth)
  lib/supabase.ts          the single Supabase client; null when unconfigured
```

Every page opens with a comment naming its module, its owner, and the FR/NFR it serves —
that's the module-comment rule in `../CODE_STANDARDS.md` — it's how the viva reviewer
reads the code.
