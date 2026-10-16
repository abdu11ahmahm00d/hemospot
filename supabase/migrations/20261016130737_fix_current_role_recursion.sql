-- ============================================================================
-- Hemospot — fix infinite recursion in current_role() (found by live test)
--
-- THE BUG: every RLS policy calls public.current_role(), which reads
-- public.profiles. But profiles itself has RLS, and its admin policies call
-- current_role() again — policy calls function reads table checks policy
-- calls function, forever, until Postgres aborts with "stack depth limit
-- exceeded". Every authenticated read and write through PostgREST hit it;
-- only SECURITY DEFINER paths (the transition RPC) worked, which is how the
-- bug hid through all earlier checks.
--
-- THE FIX (the standard Supabase pattern for policy helper functions): run
-- current_role() as SECURITY DEFINER so its single profiles lookup bypasses
-- RLS instead of re-entering it. The function reads exactly one row — the
-- caller's own role — and returns text; it grants nothing by itself. All
-- permission decisions stay in the policies that call it.
-- ============================================================================

create or replace function public.current_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;
