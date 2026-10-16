-- ============================================================================
-- Hemospot - actor display names for the case report (T-013)
--
-- THE PROBLEM: profiles are admin-read-only, so a report built by a lead
-- investigator or reviewer could only print raw actor UUIDs in the custody
-- log and approval record. A forensic report that reads "actor 11bffcb9" is
-- a joke, but opening profiles to everyone is worse.
--
-- THE SHAPE: a narrow SECURITY DEFINER function that returns names ONLY for
-- people already linked to one case the caller can see. Visibility is checked
-- first through an INVOKER helper, where the caller's own RLS decides - an
-- analyst asking about an unassigned case gets an exception, not names.
-- ============================================================================

create or replace function public.can_see_case(check_case_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $$
  select exists (select 1 from public.cases c where c.id = check_case_id);
$$;

create or replace function public.case_actor_names(check_case_id uuid)
returns table (profile_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.can_see_case(check_case_id) then
    raise exception 'case not visible to caller';
  end if;

  return query
    select distinct p.id, p.full_name
    from public.profiles p
    where p.id in (
      select c.created_by from public.cases c where c.id = check_case_id
      union
      select c.assigned_to from public.cases c
        where c.id = check_case_id and c.assigned_to is not null
      union
      select e.uploaded_by from public.evidence e where e.case_id = check_case_id
      union
      select cu.actor from public.custody_events cu
        join public.evidence e on e.id = cu.evidence_id
        where e.case_id = check_case_id
      union
      select a.requested_by from public.analyses a
        join public.evidence e on e.id = a.evidence_id
        where e.case_id = check_case_id
      union
      select a.assigned_to from public.analyses a
        join public.evidence e on e.id = a.evidence_id
        where e.case_id = check_case_id and a.assigned_to is not null
      union
      select a.reviewed_by from public.analyses a
        join public.evidence e on e.id = a.evidence_id
        where e.case_id = check_case_id and a.reviewed_by is not null
    );
end;
$function$;

grant execute on function public.can_see_case(uuid) to authenticated;
grant execute on function public.case_actor_names(uuid) to authenticated;