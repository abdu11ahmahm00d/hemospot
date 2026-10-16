-- ============================================================================
-- Hemospot - normalize search text before tokenizing (T-012)
--
-- THE MISS: to_tsvector kept 'quayside-stain-overview.png' as one compound
-- token, so searching 'quayside' matched nothing - not a permissions problem,
-- a tokenization problem, found because the evidence leg of the proof failed
-- while the case leg passed. Filenames, case numbers, and JSON metadata are
-- full of hyphens, dots, and underscores that the parser glues together.
--
-- THE FIX: a search_norm helper turns every non-alphanumeric run into a space
-- before tokenizing, applied identically on the write path (both refresh
-- triggers) and the read path (both search RPCs). Existing rows are
-- backfilled in the same migration, or old evidence stays unfindable.
-- ============================================================================

create or replace function public.search_norm(value text)
returns text
language sql
immutable
as $function$
  select regexp_replace(coalesce(value, ''), '[^A-Za-z0-9]+', ' ', 'g');
$function$;

grant execute on function public.search_norm(text) to public;

create or replace function public.refresh_cases_search_vector()
returns trigger
language plpgsql
as $function$
begin
  new.search_vector :=
    to_tsvector('english', public.search_norm(new.case_number) || ' ' ||
                           public.search_norm(new.title) || ' ' ||
                           public.search_norm(new.description));
  return new;
end;
$function$;

create or replace function public.refresh_evidence_search_vector()
returns trigger
language plpgsql
as $function$
begin
  new.search_vector :=
    to_tsvector('english', public.search_norm(new.file_name) || ' ' ||
                           public.search_norm(new.item_type) || ' ' ||
                           public.search_norm(new.metadata::text));
  return new;
end;
$function$;

-- Backfill: triggers only fire on writes, so existing rows keep stale vectors.
update public.cases
  set search_vector =
    to_tsvector('english', public.search_norm(case_number) || ' ' ||
                           public.search_norm(title) || ' ' ||
                           public.search_norm(description));

update public.evidence
  set search_vector =
    to_tsvector('english', public.search_norm(file_name) || ' ' ||
                           public.search_norm(item_type) || ' ' ||
                           public.search_norm(metadata::text));

create or replace function public.search_cases(
  query_text text,
  status_filter text default null,
  from_date timestamptz default null,
  to_date timestamptz default null,
  max_rows int default 50
)
returns table (
  id uuid,
  case_number text,
  title text,
  description text,
  status text,
  created_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    c.id, c.case_number, c.title, c.description, c.status, c.created_at,
    ts_rank(c.search_vector, plainto_tsquery('english', public.search_norm(query_text)))
  from public.cases c, plainto_tsquery('english', public.search_norm(query_text)) as q
  where c.search_vector @@ q
    and (status_filter is null or c.status = status_filter)
    and (from_date is null or c.created_at >= from_date)
    and (to_date is null or c.created_at <= to_date)
  order by 7 desc
  limit least(greatest(max_rows, 1), 100);
$function$;

create or replace function public.search_evidence(
  query_text text,
  item_type_filter text default null,
  from_date timestamptz default null,
  to_date timestamptz default null,
  max_rows int default 50
)
returns table (
  id uuid,
  case_id uuid,
  file_name text,
  item_type text,
  created_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    e.id, e.case_id, e.file_name, e.item_type, e.uploaded_at,
    ts_rank(e.search_vector, plainto_tsquery('english', public.search_norm(query_text)))
  from public.evidence e, plainto_tsquery('english', public.search_norm(query_text)) as q
  where e.search_vector @@ q
    and (item_type_filter is null or e.item_type = item_type_filter)
    and (from_date is null or e.uploaded_at >= from_date)
    and (to_date is null or e.uploaded_at <= to_date)
  order by 6 desc
  limit least(greatest(max_rows, 1), 100);
$function$;