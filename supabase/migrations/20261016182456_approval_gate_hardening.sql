-- ============================================================================
-- Hemospot — harden the supervisor approval gate (T-011, FR1.7)
--
-- THREE HOLES IN THE EXISTING GATE:
--
-- 1. Anyone on the run path could mark an analysis final. The
--    analysts_run_analyses policy had no WITH CHECK, so an analyst (or admin)
--    could set status straight to approved — self-approval, no supervisor.
--    Now the run path can never land on approved or rejected; only the
--    review path can.
--
-- 2. A reviewer could approve work that does not exist yet. The
--    reviewers_approve_analyses policy checked only the NEW row, so approving
--    a merely requested analysis passed. Now review touches only rows sitting
--    at ready_for_review: final means final, and only finished work gets there.
--
-- 3. A reviewer could rewrite the science while approving. Nothing stopped an
--    UPDATE from changing the verdict alongside the status. Result columns are
--    now write-once: only the worker (analyst role) may set them. Not even an
--    admin can fudge a verdict — a disputed result is re-run, never edited.
-- ============================================================================

-- Hole 1: the run path can never mark work final.
drop policy if exists analysts_run_analyses on public.analyses;
create policy analysts_run_analyses
  on public.analyses for update
  using (
    assigned_to = auth.uid()
    or public.current_role() in ('admin', 'analyst')
  )
  with check (status not in ('approved', 'rejected'));

-- Hole 2: review touches only finished work.
drop policy if exists reviewers_approve_analyses on public.analyses;
create policy reviewers_approve_analyses
  on public.analyses for update
  using (
    public.current_role() in ('admin', 'reviewer')
    and status = 'ready_for_review'
  )
  with check (
    public.current_role() in ('admin', 'reviewer')
    and reviewed_by = auth.uid()
    and status in ('approved', 'rejected')
  );

-- Hole 3: results are write-once for everyone but the worker.
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
