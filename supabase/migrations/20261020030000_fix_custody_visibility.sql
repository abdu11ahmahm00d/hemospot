-- ============================================================================
-- fix_custody_visibility.sql
--
-- Bug: an analyst could not read (or write) the chain of custody of a case
-- they were not assigned to, and the write failed with
--   "new row violates row-level security policy for table custody_events".
--
-- Why it happened: the custody SELECT policy reached custody_events through a
-- join to `cases`:
--   USING (EXISTS (SELECT 1 FROM evidence e JOIN cases c ON c.id = e.case_id
--            WHERE e.id = custody_events.evidence_id
--              AND (current_role() IN (staff) OR c.status IN ('review','closed'))))
-- Policy expressions are evaluated with the calling user's permissions, and an
-- analyst may only read a case that is assigned to them (cases policy:
-- assigned_to = auth.uid()). So for the analyst that join produced no rows
-- and the chain was invisible - even though the evidence policy deliberately
-- lets staff read all evidence. The write failed for the same reason: the
-- client asks for `Prefer: return=representation`, so Postgres re-checks the
-- SELECT policy on the RETURNING clause and rejects the row it just inserted.
--
-- Fix: staff (admin, lead_investigator, analyst) may read custody for any
-- evidence - the same reach the evidence policy already grants them.
-- Reviewers and viewers keep the narrow rule: custody of a case that is in
-- review or closed. The INSERT policy is unchanged; it is the visibility of
-- the returned row that was broken.
-- ============================================================================

drop policy if exists staff_read_custody_events on public.custody_events;

create policy staff_read_custody_events
  on public.custody_events for select to public
  using (
    public.current_role() = any (array['admin'::text, 'lead_investigator'::text, 'analyst'::text])
    or exists (
      select 1
      from evidence e
      join cases c on c.id = e.case_id
      where e.id = custody_events.evidence_id
        and c.status = any (array['review'::text, 'closed'::text])
    )
  );
