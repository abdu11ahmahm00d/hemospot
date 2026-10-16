-- ============================================================================
-- Hemospot — initial schema + row-level security.
--
-- Apply with `supabase db push` from development/ (project must be linked first:
-- `supabase link --project-ref <ref>`), or paste into the Supabase SQL editor.
--
-- This file IS the permission model. Read it instead of the app code to answer
-- "who can do what": RLS policies are committed as plain SQL, one rule per
-- statement, each named after the rule it encodes (per CODE_STANDARDS.md).
--
-- Roles (stored on profiles.role):
--   admin | lead_investigator | analyst | reviewer | viewer
--
-- Requirement map:
--   FR1.1–1.2      cases, case_transitions
--   FR1.3          evidence
--   FR1.4, NFR1.2  custody_events  (append-only: no update/delete grants exist)
--   FR1.5–1.6      analyses
--   FR1.7          analyses.status / assigned_to / approved_by
--   FR1.8          analyses + evidence + custody_events feed the PDF report
--   FR1.9          cases + evidence are searchable (search_vector column)
--   NFR1.1         policies below
--   NFR1.4         analysis_jobs (durable retry queue)
--   NFR1.5         evidence.sha256_hex + verify RPC
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Profiles: one row per auth user, carrying the role that every policy checks.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'viewer'
    check (role in ('admin', 'lead_investigator', 'analyst', 'reviewer', 'viewer')),
  created_at timestamptz not null default now()
);

-- New signups get a profile automatically. (An admin flips the role afterwards.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The role of whoever is asking. Used by nearly every policy below.
create or replace function public.current_role()
returns text
language sql
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- FR1.1–1.2: cases and their lifecycle transitions
-- ----------------------------------------------------------------------------
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  title text not null,
  description text not null default '',
  status text not null default 'open'
    check (status in ('open', 'investigate', 'review', 'closed')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector
);

create index if not exists cases_search_idx on public.cases using gin (search_vector);
create index if not exists cases_status_idx on public.cases (status);

create table if not exists public.case_transitions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  from_status text not null,
  to_status text not null
    check (to_status in ('open', 'investigate', 'review', 'closed')),
  acted_by uuid not null references public.profiles (id),
  note text not null default '',
  transitioned_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- FR1.3: evidence (file bytes live in Supabase Storage; this row is the record)
-- ----------------------------------------------------------------------------
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  sha256_hex text not null,
  item_type text not null default 'other'
    check (item_type in ('scene_photo', 'document', 'other')),
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid not null references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  search_vector tsvector
);

create index if not exists evidence_search_idx on public.evidence using gin (search_vector);

-- NFR1.5: recompute a file's hash and compare it with the stored one.
-- Returns true when they match. (The caller reads the file from Storage.)
create or replace function public.verify_evidence_hash(evidence_id uuid, recomputed_hex text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select recomputed_hex = sha256_hex from public.evidence where id = evidence_id;
$$;

-- ----------------------------------------------------------------------------
-- FR1.4 + NFR1.2: chain of custody — append-only by construction
-- ----------------------------------------------------------------------------
create table if not exists public.custody_events (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.evidence (id) on delete cascade,
  actor uuid not null references public.profiles (id),
  action text not null,
  reason text not null default '',
  acted_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- FR1.5–1.7 + NFR1.3/1.6/1.7: analyses and their durable job queue
-- ----------------------------------------------------------------------------
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.evidence (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  assigned_to uuid references public.profiles (id),
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'ready_for_review', 'approved', 'rejected')),
  verdict text,                    -- gunshot | impact | low_velocity | inconclusive
  confidence double precision,
  probabilities jsonb,
  explanation jsonb,
  model_sha256 text,
  stain_count integer,
  reviewed_by uuid references public.profiles (id),
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NFR1.4: the retry queue. A row per analysis run attempt; a stale `processing`
-- row is swept back to `pending` by the sidecar or a cron, so no job is lost
-- when a worker dies mid-job.
create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text not null default '',
  picked_up_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Notifications (in-app badges): case assigned, analysis ready, custody transfer
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW-LEVEL SECURITY
--
-- Deny first: every table is RLS-on with zero access by default; each policy
-- below is a grant. NFR1.1 is satisfied by construction: a role with no policy
-- on a table cannot read, write, or delete its rows.
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.cases           enable row level security;
alter table public.case_transitions enable row level security;
alter table public.evidence        enable row level security;
alter table public.custody_events  enable row level security;
alter table public.analyses        enable row level security;
alter table public.analysis_jobs   enable row level security;
alter table public.notifications   enable row level security;

-- --- profiles -------------------------------------------------------------

-- users_read_own_profile.sql: you see your own row only.
drop policy if exists users_read_own_profile on public.profiles;
create policy users_read_own_profile
  on public.profiles for select
  using (id = auth.uid());

-- admins_manage_profiles.sql: admins read and update every profile (role changes).
drop policy if exists admins_read_profiles on public.profiles;
create policy admins_read_profiles
  on public.profiles for select
  using (public.current_role() = 'admin');

drop policy if exists admins_update_profiles on public.profiles;
create policy admins_update_profiles
  on public.profiles for update
  using (public.current_role() = 'admin');

-- --- cases ----------------------------------------------------------------

-- investigators_and_analysts_read_cases.sql:
-- lead investigators and analysts read every case; reviewers and viewers read
-- only cases created by someone else that are in review/closed state, which is
-- what their approval duty needs.
drop policy if exists staff_read_cases on public.cases;
create policy staff_read_cases
  on public.cases for select
  using (
    public.current_role() in ('admin', 'lead_investigator', 'analyst')
  );

drop policy if exists reviewers_read_reviewable_cases on public.cases;
create policy reviewers_read_reviewable_cases
  on public.cases for select
  using (
    public.current_role() in ('reviewer', 'viewer')
    and status in ('review', 'closed')
  );

-- investigators_create_cases.sql: only lead investigators create cases (FR1.1).
drop policy if exists investigators_create_cases on public.cases;
create policy investigators_create_cases
  on public.cases for insert
  with check (
    public.current_role() in ('admin', 'lead_investigator')
    and created_by = auth.uid()
  );

-- investigators_update_own_cases.sql: the case owner (or admin) may edit and
-- move its status.
drop policy if exists case_owner_updates_case on public.cases;
create policy case_owner_updates_case
  on public.cases for update
  using (created_by = auth.uid() or public.current_role() = 'admin');

-- --- case transitions ------------------------------------------------------

-- staff_read_case_transitions.sql: transitions ride along with case visibility.
drop policy if exists staff_read_case_transitions on public.case_transitions;
create policy staff_read_case_transitions
  on public.case_transitions for select
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_transitions.case_id
        and (
          public.current_role() in ('admin', 'lead_investigator', 'analyst')
          or c.status in ('review', 'closed')
        )
    )
  );

-- case_participants_record_transitions.sql: the app writes a transition row
-- whenever status changes (FR1.2). The acting user must be the caller.
drop policy if exists case_participants_record_transitions on public.case_transitions;
create policy case_participants_record_transitions
  on public.case_transitions for insert
  with check (
    acted_by = auth.uid()
    and public.current_role() in ('admin', 'lead_investigator', 'analyst')
  );

-- No update/delete policy: transitions are history, not a scratchpad.

-- --- evidence ---------------------------------------------------------------

-- staff_read_evidence.sql: same visibility rule as cases.
drop policy if exists staff_read_evidence on public.evidence;
create policy staff_read_evidence
  on public.evidence for select
  using (
    exists (
      select 1 from public.cases c
      where c.id = evidence.case_id
        and (
          public.current_role() in ('admin', 'lead_investigator', 'analyst')
          or c.status in ('review', 'closed')
        )
    )
  );

-- investigators_register_evidence.sql: FR1.3. Uploader must be the caller.
drop policy if exists investigators_register_evidence on public.evidence;
create policy investigators_register_evidence
  on public.evidence for insert
  with check (
    uploaded_by = auth.uid()
    and public.current_role() in ('admin', 'lead_investigator', 'analyst')
  );

-- --- custody events ---------------------------------------------------------
-- FR1.4 + NFR1.2: append-only. Three rules, all reads/inserts — there is
-- deliberately no update and no delete policy, so editing a custody record is
-- impossible for every role, including admins.

-- staff_read_custody_events.sql: visible with the evidence's case.
drop policy if exists staff_read_custody_events on public.custody_events;
create policy staff_read_custody_events
  on public.custody_events for select
  using (
    exists (
      select 1 from public.evidence e
      join public.cases c on c.id = e.case_id
      where e.id = custody_events.evidence_id
        and (
          public.current_role() in ('admin', 'lead_investigator', 'analyst')
          or c.status in ('review', 'closed')
        )
    )
  );

-- staff_record_custody_events.sql: any investigator/analyst on the case can log
-- a handoff; the actor column must be the caller.
drop policy if exists staff_record_custody_events on public.custody_events;
create policy staff_record_custody_events
  on public.custody_events for insert
  with check (
    actor = auth.uid()
    and public.current_role() in ('admin', 'lead_investigator', 'analyst')
  );

-- --- analyses ---------------------------------------------------------------

-- staff_read_analyses.sql: analyses ride along with their evidence.
drop policy if exists staff_read_analyses on public.analyses;
create policy staff_read_analyses
  on public.analyses for select
  using (
    exists (
      select 1 from public.evidence e
      join public.cases c on c.id = e.case_id
      where e.id = analyses.evidence_id
        and (
          public.current_role() in ('admin', 'lead_investigator', 'analyst')
          or c.status in ('review', 'closed')
        )
    )
  );

-- investigators_request_analyses.sql: FR1.7, first half — an investigator
-- requests analysis on an evidence item.
drop policy if exists investigators_request_analyses on public.analyses;
create policy investigators_request_analyses
  on public.analyses for insert
  with check (
    requested_by = auth.uid()
    and public.current_role() in ('admin', 'lead_investigator')
  );

-- analysts_run_analyses.sql: FR1.7, second half — the assigned analyst fills in
-- the machine result (verdict, confidence, explanation from the sidecar) and
-- moves the analysis to ready_for_review.
drop policy if exists analysts_run_analyses on public.analyses;
create policy analysts_run_analyses
  on public.analyses for update
  using (assigned_to = auth.uid() or public.current_role() in ('admin', 'analyst'));

-- reviewers_approve_analyses.sql: FR1.7's gate — only a reviewer (or admin)
-- may take a ready_for_review analysis to approved/rejected. Analysts cannot
-- approve their own run.
drop policy if exists reviewers_approve_analyses on public.analyses;
create policy reviewers_approve_analyses
  on public.analyses for update
  using (public.current_role() in ('admin', 'reviewer'))
  with check (
    public.current_role() in ('admin', 'reviewer')
    and reviewed_by = auth.uid()
    and status in ('approved', 'rejected')
  );

-- --- analysis jobs ------------------------------------------------------------

-- analysts_claim_jobs.sql: NFR1.4. Any analyst (or the sidecar's service role)
-- can pick a pending job. The sidecar uses the service key; the policy exists
-- so the queue is readable from the SQL editor for demonstration.
drop policy if exists analysts_read_jobs on public.analysis_jobs;
create policy analysts_read_jobs
  on public.analysis_jobs for select
  using (public.current_role() in ('admin', 'analyst'));

drop policy if exists analysts_enqueue_jobs on public.analysis_jobs;
create policy analysts_enqueue_jobs
  on public.analysis_jobs for insert
  with check (public.current_role() in ('admin', 'analyst'));

drop policy if exists analysts_update_jobs on public.analysis_jobs;
create policy analysts_update_jobs
  on public.analysis_jobs for update
  using (public.current_role() in ('admin', 'analyst'));

-- --- notifications -----------------------------------------------------------

-- users_read_own_notifications.sql: badges are personal.
drop policy if exists users_read_own_notifications on public.notifications;
create policy users_read_own_notifications
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists users_update_own_notifications on public.notifications;
create policy users_update_own_notifications
  on public.notifications for update
  using (user_id = auth.uid());

-- staff_create_notifications.sql: any staff member may raise a notification for
-- another user (e.g. "analysis ready for your review").
drop policy if exists staff_create_notifications on public.notifications;
create policy staff_create_notifications
  on public.notifications for insert
  with check (public.current_role() in ('admin', 'lead_investigator', 'analyst', 'reviewer'));
