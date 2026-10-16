# Hemospot web app (D2–D5's codebase, D1 owns the seam to the sidecar)

React 19 + Vite + TypeScript + shadcn/ui + Supabase. See `../README.md` for the repo map
and the module contract — this file is just how to run it.

```bash
cp .env.example .env   # then fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # http://127.0.0.1:5173
```

- `npm run build` — typecheck + production build (what gets submitted).
- `../supabase/migrations/0001_init.sql` is the schema; paste it into the Supabase SQL
  editor before signing in, or the screens will load but every query will be denied.

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
that's `CODE_STANDARDS.md` rule one and it's how the viva reviewer reads the code.
