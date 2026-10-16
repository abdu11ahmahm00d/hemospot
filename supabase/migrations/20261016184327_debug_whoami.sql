-- TEMPORARY debug probe for T-011: who does PostgREST think the caller is?
-- Removed in the next migration once the approval mystery is solved.
create or replace function public.debug_whoami()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'role_lookup', public.current_role(),
    'jwt_sub', current_setting('request.jwt.claim.sub', true)
  );
$$;

grant execute on function public.debug_whoami() to authenticated;
