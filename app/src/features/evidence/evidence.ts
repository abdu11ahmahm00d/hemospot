/**
 * evidence.ts — every database and storage call the Evidence module makes.
 * Owner: D3 (Fatin Mahtab Nahin). Serves FR1.3 (register evidence with file upload,
 * a computed cryptographic hash, and descriptive metadata) and NFR1.5 (a recomputed
 * hash matches the stored hash on every verification request).
 *
 * Two systems meet here: the bytes live in Supabase Storage (bucket `evidence`,
 * path `evidence/<uploader-id>/<file>`), the record lives in Postgres. The SHA-256
 * is computed in the browser with Web Crypto before anything is sent.
 */

import exifr from "exifr"

import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/database.types"

type EvidenceRow = Database["public"]["Tables"]["evidence"]["Row"]

export type EvidenceItemType = "scene_photo" | "document" | "other"

export type EvidenceWithCase = EvidenceRow & {
  cases: { case_number: string; title: string } | null
}

/** SHA-256 of a file, as lowercase hex. One Web Crypto call, no library. */
export async function sha256Hex(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Camera metadata off a photo (make, model, taken-at). Only photographs carry
 * EXIF; anything else yields an empty object instead of an error.
 */
export async function readExifSummary(file: File): Promise<Record<string, string | null>> {
  if (!file.type.startsWith("image/")) return {}
  try {
    const tags = await exifr.parse(file, ["Make", "Model", "DateTimeOriginal"])
    if (!tags) return {}
    return {
      cameraMake: tags.Make != null ? String(tags.Make) : null,
      cameraModel: tags.Model != null ? String(tags.Model) : null,
      takenAt: tags.DateTimeOriginal != null ? String(tags.DateTimeOriginal) : null,
    }
  } catch {
    return {}
  }
}

function storagePathFor(userId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
  return `${userId}/${Date.now()}-${safeName}`
}

export async function uploadEvidence(input: {
  caseId: string
  file: File
  itemType: EvidenceItemType
  description: string
}): Promise<{ evidenceId: string | null; error: string | null }> {
  if (!supabase) return { evidenceId: null, error: "Supabase is not configured." }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { evidenceId: null, error: "Not signed in." }

  const hash = await sha256Hex(input.file)
  const exif = await readExifSummary(input.file)
  const storagePath = storagePathFor(userId, input.file.name)

  const { error: uploadError } = await supabase.storage
    .from("evidence")
    .upload(storagePath, input.file, { contentType: input.file.type || "application/octet-stream" })
  if (uploadError) return { evidenceId: null, error: uploadError.message }

  const { data, error: rowError } = await supabase
    .from("evidence")
    .insert({
      case_id: input.caseId,
      file_name: input.file.name,
      storage_path: storagePath,
      mime_type: input.file.type,
      size_bytes: input.file.size,
      sha256_hex: hash,
      item_type: input.itemType,
      metadata: { description: input.description, exif },
      uploaded_by: userId,
    })
    .select("id")
    .single()

  if (rowError) return { evidenceId: null, error: rowError.message }
  return { evidenceId: data.id, error: null }
}

export async function listEvidence(caseId?: string): Promise<{
  rows: EvidenceWithCase[]
  error: string | null
}> {
  if (!supabase) return { rows: [], error: "Supabase is not configured." }

  let query = supabase
    .from("evidence")
    .select("*, cases(case_number, title)")
    .order("uploaded_at", { ascending: false })
  if (caseId) query = query.eq("case_id", caseId)

  const { data, error } = await query
  // RLS decides visibility: roles outside a case never see its evidence rows.
  if (error) return { rows: [], error: error.message }
  return { rows: data as EvidenceWithCase[], error: null }
}

/**
 * NFR1.5: download the stored bytes, re-hash them, and ask the database whether
 * the recomputed hash matches the stored one. The comparison runs inside
 * Postgres (verify_evidence_hash) so the verdict is the database's, not ours.
 */
export async function verifyEvidence(row: EvidenceRow): Promise<{
  matches: boolean | null
  error: string | null
}> {
  if (!supabase) return { matches: null, error: "Supabase is not configured." }

  const { data: file, error: downloadError } = await supabase.storage
    .from("evidence")
    .download(row.storage_path)
  if (downloadError || !file) {
    return { matches: null, error: downloadError?.message ?? "Could not read the file." }
  }

  const recomputed = await sha256Hex(new File([file], row.file_name))
  const { data: matches, error: rpcError } = await supabase.rpc("verify_evidence_hash", {
    evidence_id: row.id,
    recomputed_hex: recomputed,
  })
  if (rpcError) return { matches: null, error: rpcError.message }
  return { matches, error: null }
}

/** A 5-minute signed URL for viewing. The bucket stays private; every view is minted. */
export async function viewEvidenceUrl(
  storagePath: string,
): Promise<{ url: string | null; error: string | null }> {
  if (!supabase) return { url: null, error: "Supabase is not configured." }

  const { data, error } = await supabase.storage
    .from("evidence")
    .createSignedUrl(storagePath, 300)
  if (error) return { url: null, error: error.message }
  return { url: data.signedUrl, error: null }
}
