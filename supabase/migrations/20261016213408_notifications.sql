-- ============================================================================
-- Hemospot - in-app notifications (T-014)
--
-- THE TABLE already exists from the init schema as a generic shape
-- (user_id, kind, payload Jsonb) - this ticket wires it up instead of
-- replacing it. The payload carries exactly three keys: title, detail, link.
--
-- THE SHAPE: database triggers raise every badge, never client code. There is
-- deliberately NO insert policy on this table, so no signed-in user can write
-- a notification to anyone - not even to themselves. The trigger functions run
-- as the table owner and insert exactly one row per state change they watch:
--
--   cases.assigned_to set        -> the new assignee (kind assignment)
--   analyses.assigned_to set     -> the routed analyst (kind assignment)
--   analyses -> ready_for_review -> the requester (kind analysis_ready)
--   analyses -> approved/rejected -> requester + analyst (kind decision)
--   custody_events transfer      -> case creator + assignee, minus the actor
--                                   (kind custody_transfer)
--
-- Reads are recipient-only. Updates are recipient-only too, and the UI only
-- ever sets read_at through them (mark read / mark all read). Email is an
-- explicit non-goal for this ticket (the acceptance calls it stretch).
-- ============================================================================

create index if not exists notifications_recipient_created_idx
  on public.notifications (user_id, created_at desc);

drop policy if exists recipients_read_own on public.notifications;
create policy recipients_read_own
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists recipients_mark_own on public.notifications;
create policy recipients_mark_own
  on public.notifications for update
  using (user_id = auth.uid());

-- Case assignment: the new assignee learns they own work.
create or replace function public.notify_case_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.assigned_to is not null
     and (old.assigned_to is null or old.assigned_to <> new.assigned_to) then
    insert into public.notifications (user_id, kind, payload)
    values (
      new.assigned_to,
      'assignment',
      Jsonb_build_object(
        'title', 'Assigned to case ' || new.case_number,
        'detail', new.title,
        'link', '/cases/' || new.id
      )
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists notify_case_assignment on public.cases;
create trigger notify_case_assignment
  after update of assigned_to on public.cases
  for each row execute function public.notify_case_assignment();

-- Analysis routing: the analyst learns work is waiting for them.
create or replace function public.notify_analysis_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  file_name text;
begin
  if new.assigned_to is not null
     and (old.assigned_to is null or old.assigned_to <> new.assigned_to) then
    select e.file_name into file_name
    from public.evidence e where e.id = new.evidence_id;
    insert into public.notifications (user_id, kind, payload)
    values (
      new.assigned_to,
      'assignment',
      Jsonb_build_object(
        'title', 'Analysis routed to you',
        'detail', 'Evidence ' || coalesce(file_name, new.evidence_id::text),
        'link', '/analyses/' || new.id
      )
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists notify_analysis_assignment on public.analyses;
create trigger notify_analysis_assignment
  after update of assigned_to on public.analyses
  for each row execute function public.notify_analysis_assignment();

-- Analysis verdicts: ready pings the requester, the decision pings both ends.
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
          || ' (' || round(coalesce(new.confidence, 0) * 100, 1) || '%)',
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

drop trigger if exists notify_analysis_status on public.analyses;
create trigger notify_analysis_status
  after update of status on public.analyses
  for each row execute function public.notify_analysis_status();

-- Custody transfer: the case owner and the assigned analyst hear about moves
-- they did not make themselves.
create or replace function public.notify_custody_transfer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  case_id uuid;
  creator uuid;
  assignee uuid;
  file_name text;
  notice Jsonb;
begin
  if new.action <> 'transfer' then
    return new;
  end if;

  select e.case_id, e.file_name into case_id, file_name
  from public.evidence e where e.id = new.evidence_id;

  select c.created_by, c.assigned_to into creator, assignee
  from public.cases c where c.id = case_id;

  notice := Jsonb_build_object(
    'title', 'Custody transfer recorded',
    'detail', 'Evidence ' || coalesce(file_name, new.evidence_id::text)
      || ': ' || coalesce(new.reason, 'no reason given'),
    'link', '/custody'
  );

  if creator is not null and creator <> new.actor then
    insert into public.notifications (user_id, kind, payload)
    values (creator, 'custody_transfer', notice);
  end if;

  if assignee is not null and assignee <> new.actor and assignee <> creator then
    insert into public.notifications (user_id, kind, payload)
    values (assignee, 'custody_transfer', notice);
  end if;
  return new;
end;
$function$;

drop trigger if exists notify_custody_transfer on public.custody_events;
create trigger notify_custody_transfer
  after insert on public.custody_events
  for each row execute function public.notify_custody_transfer();