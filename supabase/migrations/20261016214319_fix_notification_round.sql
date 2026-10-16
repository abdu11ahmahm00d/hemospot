-- ============================================================================
-- Hemospot - round(double, int) does not exist (T-014)
--
-- THE OUTAGE: notify_analysis_status built its detail line with
-- round(coalesce(new.confidence, 0) * 100, 1), but confidence is double
-- precision and Postgres only defines round(numeric, int). The trigger raised
-- on every write to ready_for_review, so the worker's verdict update failed
-- all 5 attempts and the analysis never became ready. The live proof caught
-- it: the job row said failed with the missing-function error.
--
-- THE RULE: inside triggers, cast to numeric before rounding. The worker path
-- stays untouched.
-- ============================================================================

create or replace function public.notify_analysis_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'ready_for_review' and old.status is distinct from new.status then
    insert into public.notifications (user_id, kind, payload)
    values (
      new.requested_by,
      'analysis_ready',
      Jsonb_build_object(
        'title', 'Analysis ready for review',
        'detail', 'Verdict ' || coalesce(new.verdict, 'pending')
          || ' (' || round((coalesce(new.confidence, 0) * 100)::numeric, 1) || '%)',
        'link', '/analyses/' || new.id
      )
    );
  end if;

  if new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    insert into public.notifications (user_id, kind, payload)
    values (
      new.requested_by,
      'decision',
      Jsonb_build_object(
        'title', 'Analysis ' || new.status,
        'detail', coalesce(new.review_note, ''),
        'link', '/analyses/' || new.id
      )
    );
    if new.assigned_to is not null and new.assigned_to <> new.requested_by then
      insert into public.notifications (user_id, kind, payload)
      values (
        new.assigned_to,
        'decision',
        Jsonb_build_object(
          'title', 'Analysis ' || new.status,
          'detail', coalesce(new.review_note, ''),
          'link', '/analyses/' || new.id
        )
      );
    end if;
  end if;
  return new;
end;
$function$;