-- TEMPORARY probe v2 for T-011: raise only for the reviewer role, so the admin
-- can stage a ready row first. Removed right after the diagnosis.
create or replace function public.forbid_result_rewrite()
returns trigger
language plpgsql
as $$
begin
  if public.current_role() = 'reviewer' then
    raise exception 'PROBE-TRIGGER role=% old_status=% new_status=%',
      public.current_role(), old.status, new.status;
  end if;
  return new;
end;
$$;
