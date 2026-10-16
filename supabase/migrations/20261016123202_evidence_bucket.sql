-- ============================================================================
-- Hemospot — evidence photo bucket + its policies (T-008, FR1.3 storage half)
--
-- The `evidence` bucket holds the raw photo bytes. The `evidence` table row
-- (migration 0001) holds the record: hash, metadata, uploader. The two meet on
-- `storage_path`.
--
-- Conventions the app follows (D3, see T-006):
--   upload path:  evidence/<uploader-user-id>/<file-name>
--   viewing:      signed URLs minted per request (bucket stays private)
--
-- Evidence bytes are immutable: INSERT and SELECT exist, UPDATE and DELETE do
-- not — for any role. A corrected upload is a new row, never an overwrite.
-- That is the storage half of NFR1.5.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

-- staff_upload_evidence_files: a signed-in staff member uploads only into
-- their own folder. The folder name IS their user id — no cross-uploads.
drop policy if exists staff_upload_evidence_files on storage.objects;
create policy staff_upload_evidence_files
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- staff_read_evidence_files: any signed-in staff member may read. Which files
-- anyone SEES is still governed by the Postgres RLS on the evidence table and
-- case visibility — Storage only checks the signature on the door.
drop policy if exists staff_read_evidence_files on storage.objects;
create policy staff_read_evidence_files
  on storage.objects for select
  to authenticated
  using (bucket_id = 'evidence');

-- Deliberately absent: no UPDATE, no DELETE policy. Evidence bytes cannot be
-- overwritten or removed by anyone, including admins.
