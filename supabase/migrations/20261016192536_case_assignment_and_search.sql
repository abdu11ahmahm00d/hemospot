-- ============================================================================
-- Hemospot - case assignment plus role-filtered full-text search (T-012)
--
-- 1. Assignment: cases gain an assigned_to analyst. Analysts see only cases
--    assigned to them - that is the acceptance test, enforced in RLS so every
--    query path (cases page, search, joins) obeys it, not just search.
--    Assigning needs no new UPDATE policy: the creator-or-admin rule already
--    covers the case creator (a lead investigator) and admins.
--
-- 2. Directory: lead investigators can read analyst profile rows (id, name)
--    so they can assign the cases they create. Admins already see everyone;
--    nobody else gains anything.
--
-- 3. Search: two SECURITY INVOKER functions, so the caller's own RLS decides
--    every row. Ranked by ts_rank, capped, with the filters the search page
--    promises (case status, evidence type, date range). Empty queries match
--    nothing - listing everything is the cases page's job, not search's.
-- ============================================================================

alter table public.cases
  add column if not exists assigned_to uuid references public.profiles (id);

create index if not exists cases_assigned_to_idx on public.cases (assigned_to);

drop policy if exists staff_read_cases on public.cases;
create policy staff_read_cases
  on public.cases for select
  using (
    public.current_role() in ('admin', 'lead_investigator')
    or (
      public.current_role() = 'analyst'
      and assigned_to = auth.uid()
    )
  );

create policy leads_read_analyst_directory
  on public.profiles for select
  using (
    public.current_role() = 'lead_investigator'
    and role = 'analyst'
  );

create or replace function public.search_cases(
  query_text text,
  status_filter text default null,
  from_date timestamptz default null,
  to_date timestamptz default null,
  max_rows int default 50
)
returns table (
  id uuid,
  case_number text,
  title text,
  description text,
  status text,
  created_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    c.id, c.case_number, c.title, c.description, c.status, c.created_at,
    ts_rank(c.search_vector, plainto_tsquery('english', query_text))
  from public.cases c, plainto_tsquery('english', query_text) as q
  where c.search_vector @@ q
    and (status_filter is null or c.status = status_filter)
    and (from_date is null or c.created_at >= from_date)
    and (to_date is null or c.created_at <= to_date)
  order by 7 desc
  limit least(greatest(max_rows, 1), 100);
$function$;

create or replace function public.search_evidence(
  query_text text,
  item_type_filter text default null,
  from_date timestamptz default null,
  to_date timestamptz default null,
  max_rows int default 50
)
returns table (
  id uuid,
  case_id uuid,
  file_name text,
  item_type text,
  created_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    e.id, e.case_id, e.file_name, e.item_type, e.uploaded_at,
    ts_rank(e.search_vector, plainto_tsquery('english', query_text))
  from public.evidence e, plainto_tsquery('english', query_text) as q
  where e.search_vector @@ q
    and (item_type_filter is null or e.item_type = item_type_filter)
    and (from_date is null or e.uploaded_at >= from_date)
    and (to_date is null or e.uploaded_at <= to_date)
  order by 6 desc
  limit least(greatest(max_rows, 1), 100);
$function$;

grant execute on function public.search_cases(text, text, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.search_evidence(text, text, timestamptz, timestamptz, int) to authenticated;