-- ============================================================================
-- Hemospot - nobody forges badges (T-014)
--
-- THE HOLE: the init schema shipped staff_create_notifications, letting any
-- analyst, reviewer, lead, or admin INSERT arbitrary notification rows to
-- anyone - including fake "Analysis approved" badges. The live negative
-- proved it: a forged row landed for real. Badges are trust signals, so the
-- insert path belongs to the triggers alone (SECURITY DEFINER functions run
-- as the owner and need no policy at all).
--
-- This drops the init insert policy outright, and folds the init's
-- read/update pair (users_read/update_own_notifications) into this
-- ticket's recipients_* pair so one migration owns the whole table.
-- ============================================================================

drop policy if exists staff_create_notifications on public.notifications;
drop policy if exists users_read_own_notifications on public.notifications;
drop policy if exists users_update_own_notifications on public.notifications;