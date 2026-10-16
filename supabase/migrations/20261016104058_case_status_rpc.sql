-- ============================================================================
-- Hemospot — case status transitions in one transaction (FR1.2)
--
-- WHY THIS EXISTS: FR1.2 says EVERY lifecycle transition must be recorded with
-- the acting user and timestamp. If the app updated `cases.status` and inserted
-- the `case_transitions` row as two separate calls, one could succeed while the
-- other failed — and history would disagree with reality. This function does
-- both writes inside a single database transaction: either both land, or
-- neither does. Either Postgres commits the pair, or it raises an error.
--
-- The lifecycle is forward-only: open → investigate → review → closed.
-- `closed` is terminal. Anything else raises an exception.
-- ============================================================================

-- The one legal next step for each status. NULL means terminal (no next step).
create or replace function public.next_case_status(current_status text)
returns text
language sql
immutable
as $$
  select case current_status
    when 'open' then 'investigate'
    when 'investigate' then 'review'
    when 'review' then 'closed'
    else null
  end;
$$;

-- Move one case one step forward and record who did it and when.
-- Called from the app as: supabase.rpc('transition_case_status', {...}).
create or replace function public.transition_case_status(
  p_case_id uuid,
  p_to_status text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_from_status text;
  v_expected_to text;
  v_caller_role text;
  v_transition_id uuid;
begin
  -- Only case owners move their own cases; admins move any case. Analysts,
  -- reviewers and viewers cannot move cases at all — the app hides the button,
  -- and this check is the enforcement behind it (NFR1.1).
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is null then
    raise exception 'not signed in';
  end if;

  select status into v_from_status from public.cases where id = p_case_id;
  if v_from_status is null then
    raise exception 'case not found';
  end if;

  -- The real ownership check, written plainly: admins pass; otherwise the
  -- caller must be the case's creator.
  if v_caller_role <> 'admin' then
    perform 1 from public.cases
    where id = p_case_id and created_by = auth.uid();
    if not found then
      raise exception 'only the case owner or an admin may move this case';
    end if;
  end if;

  -- Only investigators (and admins) move cases; other roles are read-only here.
  if v_caller_role not in ('admin', 'lead_investigator') then
    raise exception 'only investigators may move cases';
  end if;

  -- The step must be exactly the next one — no skipping, no going back.
  v_expected_to := public.next_case_status(v_from_status);
  if v_expected_to is null then
    raise exception 'case is closed; closed cases do not move';
  end if;
  if p_to_status <> v_expected_to then
    raise exception 'illegal transition: % cannot move to %', v_from_status, p_to_status;
  end if;

  -- Both writes, one transaction: the status move and its history row.
  update public.cases
  set status = p_to_status, updated_at = now()
  where id = p_case_id;

  insert into public.case_transitions (case_id, from_status, to_status, acted_by, note)
  values (p_case_id, v_from_status, p_to_status, auth.uid(), p_note)
  returning id into v_transition_id;

  return v_transition_id;
end;
$$;

-- The RPC is callable by any signed-in user; the checks INSIDE the function
-- decide who may actually move a case. Revoke-then-grant keeps that explicit.
revoke all on function public.transition_case_status(uuid, text, text) from public;
grant execute on function public.transition_case_status(uuid, text, text) to authenticated;
grant execute on function public.next_case_status(text) to authenticated;

-- ============================================================================
-- FR1.9 support: keep the full-text search vectors fresh automatically.
-- Whenever a case or evidence row is written, its searchable text is rebuilt
-- from the same columns the search query reads. No app code involved.
-- ============================================================================

create or replace function public.refresh_cases_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    to_tsvector('english', coalesce(new.case_number, '') || ' ' ||
                           coalesce(new.title, '') || ' ' ||
                           coalesce(new.description, ''));
  return new;
end;
$$;

drop trigger if exists cases_search_vector_trigger on public.cases;
create trigger cases_search_vector_trigger
  before insert or update of case_number, title, description on public.cases
  for each row execute function public.refresh_cases_search_vector();

create or replace function public.refresh_evidence_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    to_tsvector('english', coalesce(new.file_name, '') || ' ' ||
                           coalesce(new.item_type, '') || ' ' ||
                           coalesce(new.metadata::text, ''));
  return new;
end;
$$;

drop trigger if exists evidence_search_vector_trigger on public.evidence;
create trigger evidence_search_vector_trigger
  before insert or update of file_name, item_type, metadata on public.evidence
  for each row execute function public.refresh_evidence_search_vector();
