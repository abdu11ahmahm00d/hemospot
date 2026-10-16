-- ============================================================================
-- Hemospot — final approval gate (T-011, FR1.7). Supersedes the three probe
-- migrations before it (debug_whoami, probe_trigger, probe_trigger_v2), which
-- are kept in history and undone here.
--
-- WHAT THE PROBES PROVED (2026-10-16, live): an UPDATE on analyses reaches
-- its row only when the caller can also SELECT that row through the
-- evidence→cases chain — the query plan ANDs the chain's SELECT policies onto
-- the update. A reviewer who cannot SEE finished work cannot APPROVE it, no
-- matter what the UPDATE policy says. So the UPDATE gate needs a matching
-- SELECT gate: reviewers see every analysis in the review lifecycle
-- (ready_for_review, approved, rejected), plus its evidence and its case,
-- whatever the case status. They stay blind to requested/processing work.
--
-- THIS MIGRATION, four parts:
--
-- 1. Review-lifecycle visibility (the fix): reviewers SELECT analyses,
--    evidence, and cases tied to ready/decided work. Read-only throughout —
--    no UPDATE/INSERT/DELETE policy is touched for reviewers here.
--    Drive-by hardening in the same rewrite: the old "case is review/closed"
--    branches had no role check, so anonymous callers (public anon key) could
--    read closed-case rows. Both branches now require a signed-in staff role;
--    signed-in behaviour is unchanged.
--
-- 2. No fabricated readiness (the hole the probes found along the way): an
--    admin could mark an un-run analysis ready_for_review and then approve it
--    themselves. Now only the analyst role — the worker and the analysts —
--    may land a row on ready_for_review. Admins keep routing (assigned_to)
--    on non-final rows.
--
-- 3. Result columns stay write-once (from 0007): only the worker sets them.
--
-- 4. Housekeeping: drop the two debug RPCs and restore the real trigger.
-- ============================================================================

-- ---- 1. reviewers see the review lifecycle, case status aside ----

drop policy if exists staff_read_analyses on public.analyses;
create policy staff_read_analyses
  on public.analyses for select
  using (
    public.current_role() in ('admin', 'lead_investigator', 'analyst')
    or (
      public.current_role() = 'reviewer'
      and status in ('ready_for_review', 'approved', 'rejected')
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
      and exists (
        select 1 from public.analyses a
        where a.evidence_id = evidence.id
          and a.status in ('ready_for_review', 'approved', 'rejected')
      )
    )
  );

drop policy if exists reviewers_read_reviewable_cases on public.cases;
create policy reviewers_read_reviewable_cases
  on public.cases for select
  using (
    public.current_role() in ('reviewer', 'viewer')
    and (
      status in ('review', 'closed')
      or (
        public.current_role() = 'reviewer'
        and exists (
          select 1 from public.evidence e
          join public.analyses a on a.evidence_id = e.id
          where e.case_id = cases.id
            and a.status in ('ready_for_review', 'approved', 'rejected')
        )
      )
    )
  );

-- ---- 2. only analysts land work on ready_for_review ----

drop policy if exists analysts_run_analyses on public.analyses;
create policy analysts_run_analyses
  on public.analyses for update
  using (
    assigned_to = auth.uid()
    or public.current_role() in ('admin', 'analyst')
  )
  with check (
    status not in ('approved', 'rejected')
    and (status <> 'ready_for_review' or public.current_role() = 'analyst')
  );

-- ---- 3 + 4. real write-once trigger back, debug probes dropped ----

create or replace function public.forbid_result_rewrite()
returns trigger
language plpgsql
as $$
begin
  if public.current_role() = 'analyst' then
    return new;
  end if;
  if (new.verdict is distinct from old.verdict
      or new.confidence is distinct from old.confidence
      or new.probabilities is distinct from old.probabilities
      or new.explanation is distinct from old.explanation
      or new.stains is distinct from old.stains
      or new.stain_count is distinct from old.stain_count
      or new.timing_ms is distinct from old.timing_ms
      or new.model_sha256 is distinct from old.model_sha256
      or new.evidence_id is distinct from old.evidence_id
      or new.requested_by is distinct from old.requested_by) then
    raise exception 'result columns are write-once: only the analysis worker may set them';
  end if;
  return new;
end;
$$;

drop trigger if exists forbid_result_rewrite on public.analyses;
create trigger forbid_result_rewrite
  before update on public.analyses
  for each row execute function public.forbid_result_rewrite();

drop function if exists public.debug_whoami();
drop function if exists public.debug_try_approve(uuid);
