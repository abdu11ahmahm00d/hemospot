-- ============================================================================
-- Hemospot — T-016 verification scenario: the fixtures the NFR matrix runs on.
--
-- Applied by verification/rbac-matrix.ps1 through the Management API (no DB
-- password needed). Idempotent: the teardown fences below run first, then the
-- scenario is recreated — safe to run any number of times.
--
-- Fence convention: every row this file (or a probe) creates is reachable from
-- a case whose case_number starts with 'VERIFY-'. The teardown deletes exactly
-- that reachable set and nothing else, so real demo data is never touched.
--
-- __PATTERN_SHA256__ / __PATTERN_SIZE__ are replaced by the runner with the
-- real hash/size of sidecar/app/smoke_pattern.png (the file the runner uploads
-- as firman's evidence object).
--
-- Personas (see seed.sql):
--   nahin_lead@hemospot.local      lead_investigator
--   firman@hemospot.local          analyst
--   mosaddika_reviewer@...         reviewer
--   mowmita_viewer@...             viewer
--   arman_admin@...                admin
-- ============================================================================

-- ---------------------------------------------------------------- teardown --
delete from public.analysis_jobs
 where analysis_id in (
   select a.id from public.analyses a
   join public.evidence e on e.id = a.evidence_id
   join public.cases c on c.id = e.case_id
   where c.case_number like 'VERIFY-%');

delete from public.analyses
 where evidence_id in (
   select e.id from public.evidence e
   join public.cases c on c.id = e.case_id
   where c.case_number like 'VERIFY-%');

delete from public.custody_events
 where evidence_id in (
   select e.id from public.evidence e
   join public.cases c on c.id = e.case_id
   where c.case_number like 'VERIFY-%');

delete from public.case_transitions
 where case_id in (select id from public.cases where case_number like 'VERIFY-%');

delete from public.evidence
 where case_id in (select id from public.cases where case_number like 'VERIFY-%');

delete from public.notifications
 where id in ('00000000-0000-4000-8000-000000000031',
              '00000000-0000-4000-8000-000000000032');

delete from public.cases where case_number like 'VERIFY-%';

-- ---------------------------------------------------------------- fixtures --
insert into public.cases (id, case_number, title, description, status, created_by, assigned_to) values
  ('00000000-0000-4000-8000-000000000001', 'VERIFY-OPEN-1',
   'Verification: open case', 'Scenario fixture - an open case assigned to the analyst.',
   'open', (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   (select id from auth.users where email = 'firman@hemospot.local')),
  ('00000000-0000-4000-8000-000000000002', 'VERIFY-REVIEW-1',
   'Verification: case under review', 'Scenario fixture - a case in review with a finished analysis.',
   'review', (select id from auth.users where email = 'nahin_lead@hemospot.local'), null),
  ('00000000-0000-4000-8000-000000000003', 'VERIFY-CLOSED-1',
   'Verification: closed case', 'Scenario fixture - a closed case.',
   'closed', (select id from auth.users where email = 'nahin_lead@hemospot.local'), null);

insert into public.evidence (id, case_id, file_name, storage_path, mime_type, size_bytes,
                             sha256_hex, item_type, uploaded_by) values
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
   'verify-pattern.png',
   -- bucket-relative key, exactly as evidence.ts storagePathFor() builds it:
   -- "<uploader-id>/<file>" inside the 'evidence' bucket, no bucket-name prefix.
   (select id::text from auth.users where email = 'firman@hemospot.local') || '/verify-pattern.png',
   'image/png', __PATTERN_SIZE__, '__PATTERN_SHA256__', 'scene_photo',
   (select id from auth.users where email = 'firman@hemospot.local')),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
   'verify-review.png', 'fixture/verify-review.png', 'image/png', 0,
   repeat('ab', 32), 'scene_photo',
   (select id from auth.users where email = 'firman@hemospot.local')),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000003',
   'verify-closed.png', 'fixture/verify-closed.png', 'image/png', 0,
   repeat('cd', 32), 'scene_photo',
   (select id from auth.users where email = 'firman@hemospot.local'));

insert into public.custody_events (id, evidence_id, actor, action, reason) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000004',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   'collected', 'Sealed into evidence locker (verification fixture)'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000004',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   'transferred', 'Handed to the lab bench (verification fixture)'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000006',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   'collected', 'Filed with the closed case (verification fixture)');

-- tr0 sits on an open case on purpose: it is the row a viewer must NOT see.
insert into public.case_transitions (id, case_id, from_status, to_status, acted_by, note) values
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000001',
   'open', 'open',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   'Verification fixture row on an open case'),
  ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000002',
   'open', 'review',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   'Moved to review for the supervisor (verification fixture)'),
  ('00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000003',
   'review', 'closed',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   'Closed after sign-off (verification fixture)');

-- aR  (ready_for_review, on the review case) - the reviewer's legitimate target,
--     and the NFR1.6/1.7 row every result field must be present on.
insert into public.analyses (id, evidence_id, requested_by, assigned_to, status, verdict,
                             confidence, probabilities, explanation, model_sha256,
                             stain_count, stains, timing_ms) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000005',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   (select id from auth.users where email = 'firman@hemospot.local'),
   'ready_for_review', 'gunshot', 0.91,
   '{"gunshot": 0.91, "stab": 0.06, "blunt": 0.03}'::jsonb,
   ('{"top_features": [{"feature": "spatter_density", "plain_name": "Spatter density", ' ||
    '"importance": 0.42, "measured_value": 3.1}], ' ||
    '"summary": "Dense high-velocity spatter pattern; measured features lean to gunshot."}')::jsonb,
   '9dbe8afe9dfba4f00be659a4002debf54abce4b4a728027e32d36243b968fcda',
   1,
   ('[{"centroid_x": 120.0, "centroid_y": 80.0, "major_axis": 30.0, "minor_axis": 18.0, ' ||
    '"orientation_deg": 15.0, "area_mm2": 420.0}]')::jsonb,
   389.0),
  ('00000000-0000-4000-8000-000000000026', '00000000-0000-4000-8000-000000000005',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   (select id from auth.users where email = 'firman@hemospot.local'),
   'ready_for_review', 'stab', 0.88,
   '{"gunshot": 0.07, "stab": 0.88, "blunt": 0.05}'::jsonb,
   '{"top_features": [], "summary": "Scenario fixture."}'::jsonb,
   '9dbe8afe9dfba4f00be659a4002debf54abce4b4a728027e32d36243b968fcda',
   1, '[]'::jsonb, 410.0),
-- aQ  (requested, on the review case) - what an analyst legitimately runs next.
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000005',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   (select id from auth.users where email = 'firman@hemospot.local'),
   'requested', null, null, null, null, null, null, '[]'::jsonb, null),
-- aO  (requested, on the open case) - an analysis no reviewer may touch yet.
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000004',
   (select id from auth.users where email = 'nahin_lead@hemospot.local'),
   (select id from auth.users where email = 'firman@hemospot.local'),
   'requested', null, null, null, null, null, null, '[]'::jsonb, null);

-- fixture jobs sit at 'done' on purpose: the kill-test needs the queue to
-- contain nothing but its own fresh job, and no probe depends on these being
-- claimable.
insert into public.analysis_jobs (id, analysis_id, status) values
  ('00000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000023', 'done'),
  ('00000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000022', 'done');

insert into public.notifications (id, user_id, kind, payload) values
  ('00000000-0000-4000-8000-000000000031',
   (select id from auth.users where email = 'mosaddika_reviewer@hemospot.local'),
   'analysis_approved', '{"case_number": "VERIFY-REVIEW-1"}'::jsonb),
  ('00000000-0000-4000-8000-000000000032',
   (select id from auth.users where email = 'mowmita_viewer@hemospot.local'),
   'analysis_approved', '{"case_number": "VERIFY-REVIEW-1"}'::jsonb);
