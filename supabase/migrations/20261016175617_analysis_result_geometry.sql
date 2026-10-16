-- ============================================================================
-- Hemospot — store the result's drawing data and timing on analyses (T-010)
--
-- THE GAP: the worker wrote the verdict, confidence, probabilities, and
-- explanation, but the per-stain ellipses (what the overlay draws) and the
-- run's timing (the NFR1.3 evidence) had nowhere to live — the sidecar returns
-- them, the database dropped them.
--
-- Two plain columns, written by the worker alongside the verdict. The overlay
-- reads `stains`; the report and the NFR matrix read `timing_ms`. No policy
-- change: the existing analyst-only UPDATE rule already covers these columns.
-- ============================================================================

alter table public.analyses
  add column if not exists stains jsonb not null default '[]'::jsonb;

alter table public.analyses
  add column if not exists timing_ms double precision;
