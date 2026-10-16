-- ============================================================================
-- Hemospot - assignment badges on the insert path too (T-014)
--
-- THE GAP: the assignment triggers only watched UPDATE OF assigned_to, so a
-- row created already-assigned never raised a badge. The live proof caught it:
-- the proof case was created with its analyst attached and no badge fired.
-- The UI flow (create bare, assign later) always worked, but the database
-- must not depend on the UI being polite.
--
-- INSERT triggers cannot reuse the update functions (OLD does not exist on
-- insert), so each table gets a small create-path twin that fires only when
-- the new row arrives already assigned.
-- ============================================================================

create or replace function public.notify_case_assignment_on_create()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.assigned_to is not null then
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

drop trigger if exists notify_case_assignment_on_create on public.cases;
create trigger notify_case_assignment_on_create
  after insert on public.cases
  for each row execute function public.notify_case_assignment_on_create();

create or replace function public.notify_analysis_assignment_on_create()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  file_name text;
begin
  if new.assigned_to is not null then
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

drop trigger if exists notify_analysis_assignment_on_create on public.analyses;
create trigger notify_analysis_assignment_on_create
  after insert on public.analyses
  for each row execute function public.notify_analysis_assignment_on_create();