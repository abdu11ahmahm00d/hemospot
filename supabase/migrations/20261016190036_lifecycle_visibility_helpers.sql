-- ============================================================================
-- Hemospot — fix the policy recursion from approval_gate_final (T-011)
--
-- WHAT BROKE: the lifecycle EXISTS subqueries referenced RLS-protected tables
-- directly (cases policy → evidence → evidence policy → cases → …), and
-- Postgres aborts that with "infinite recursion detected" — every insert with
-- a representation broke with HTTP 500, not just reviewer reads.
--
-- THE PATTERN (same as current_role()): cross-table visibility checks live in
-- SECURITY DEFINER helpers, which the table owner runs past RLS. Policies call
-- the helpers, helpers never trigger policies, so no cycle can form.
-- ============================================================================

-- A case carries reviewable work: finished or decided analyses on its evidence.
create or replace function public.case_in_review_lifecycle(check_case_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.evidence e
    join public.analyses a on a.evidence_id = e.id
    where e.case_id = check_case_id
      and a.status in ('ready_for_review', 'approved', 'rejected')
  );
$$;

-- One evidence item carries reviewable work.
create or replace function public.evidence_in_review_lifecycle(check_evidence_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.analyses a
    where a.evidence_id = check_evidence_id
      and a.status in ('ready_for_review', 'approved', 'rejected')
  );
$$;

grant execute on function public.case_in_review_lifecycle(uuid) to public;
grant execute on function public.evidence_in_review_lifecycle(uuid) to public;

-- ---- cases: reviewers keep review/closed; lifecycle added reviewer-only ----

drop policy if exists reviewers_read_reviewable_cases on public.cases;
create policy reviewers_read_reviewable_cases
  on public.cases for select
  using (
    public.current_role() in ('reviewer', 'viewer')
    and (
      status in ('review', 'closed')
      or (
        public.current_role() = 'reviewer'
        and public.case_in_review_lifecycle(id)
      )
    )
  );

-- ---- evidence: same shape, via the evidence helper ----

drop policy if exists staff_read_evidence on public.evidence;
create policy staff_read_evidence
  on public.evidence for select
  using (
    public.current_role() in ('admin', 'lead_investigator', 'analyst')
    or (
      public.current_role() in ('admin', 'lead_investigator', 'analyst', 'reviewer', 'viewer')
      and exists (
        select 1 from public.cases c
        where c.id = evidence.case_id
          and c.status in ('review', 'closed')
      )
    )
    or (
      public.current_role() = 'reviewer'
      and public.evidence_in_review_lifecycle(id)
    )
  );

-- ---- analyses: lifecycle branch via the evidence helper ----

drop policy if exists staff_read_analyses on public.analyses;
create policy staff_read_analyses
  on public.analyses for select
  using (
    public.current_role() in ('admin', 'lead_investigator', 'analyst')
    or (
      public.current_role() = 'reviewer'
      and (
        status in ('ready_for_review', 'approved', 'rejected')
        or public.evidence_in_review_lifecycle(evidence_id)
      )
    )
    or (
      public.current_role() in ('admin', 'lead_investigator', 'analyst', 'reviewer', 'viewer')
      and exists (
        select 1 from public.evidence e
        join public.cases c on c.id = e.case_id
        where e.id = analyses.evidence_id
          and c.status in ('review', 'closed')
      )
    )
  );
