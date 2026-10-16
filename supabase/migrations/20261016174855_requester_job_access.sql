-- ============================================================================
-- Hemospot — let investigators enqueue and track their own analysis jobs
-- (T-009, FR1.7 request half)
--
-- THE GAP: requesting an analysis means two writes — the analyses row (which
-- lead investigators may already insert) and its analysis_jobs row (which only
-- admins and analysts could insert or read). A requester who cannot enqueue
-- the job, or see whether it is pending, processing, or done, cannot use the
-- feature the request button promises.
--
-- THE FIX, least-privilege: the two job policies below add lead_investigator
-- to SELECT and INSERT only. Claiming and completing jobs (UPDATE) stays with
-- admins and analysts — the worker signs in as an analyst, so the queue still
-- cannot be driven or tampered with by requesters.
-- ============================================================================

drop policy if exists analysts_read_jobs on public.analysis_jobs;
create policy analysts_read_jobs
  on public.analysis_jobs for select
  using (public.current_role() in ('admin', 'analyst', 'lead_investigator'));

drop policy if exists analysts_enqueue_jobs on public.analysis_jobs;
create policy analysts_enqueue_jobs
  on public.analysis_jobs for insert
  with check (public.current_role() in ('admin', 'analyst', 'lead_investigator'));
