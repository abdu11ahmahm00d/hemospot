-- ============================================================================
-- Hemospot - can_see_case must not rely on RLS (T-013)
--
-- THE LEAK: can_see_case was SECURITY INVOKER around a plain SELECT on cases,
-- trusting the caller's RLS to filter. But it is only ever called from
-- inside case_actor_names, which is SECURITY DEFINER - and an invoker
-- function nested in a definer one runs as the function OWNER, whose RLS is
-- bypassed. The check passed for everyone, and an analyst got names off a
-- case they cannot see. The live negative caught it, not the code review.
--
-- THE RULE: a visibility check consumed inside DEFINER context must spell
-- out the role logic explicitly with auth.uid() and current_role(), which
-- both report the real caller regardless of nesting. It duplicates the case
-- SELECT policies by design - keep this function in sync with
-- staff_read_cases and reviewers_read_reviewable_cases if those change.
-- Helpers called FROM POLICIES (like case_in_review_lifecycle) are unaffected:
-- policies evaluate as the caller, so nesting never elevates there.
-- ============================================================================

create or replace function public.can_see_case(check_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = check_case_id
      and (
        public.current_role() in ('admin', 'lead_investigator')
        or (
          public.current_role() = 'analyst'
          and c.assigned_to = auth.uid()
        )
        or (
          public.current_role() = 'reviewer'
          and (
            c.status in ('review', 'closed')
            or public.case_in_review_lifecycle(c.id)
          )
        )
        or (
          public.current_role() = 'viewer'
          and c.status in ('review', 'closed')
        )
      )
  );
$$;