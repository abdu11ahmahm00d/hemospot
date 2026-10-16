/**
 * analyses.ts — every database call the Analyses module makes.
 * Owner: D5 (Farhana Yesmin). Serves FR1.5 (stain photo → detection with per-stain
 * geometry), FR1.6 (class into the trained classes with per-class confidence),
 * FR1.7 (investigator requests, analyst runs, supervisor approves) and NFR1.6/1.7
 * (every result carries confidence + explanation, or reads "inconclusive").
 *
 * Requesting is two writes: the analyses row, then its analysis_jobs row. The
 * queue worker picks the job up, runs the sidecar, and writes the verdict back —
 * this file never calls the ML engine directly, so a dead sidecar only ever
 * shows as "pending", never as a crash.
 */

import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/database.types"

type AnalysisRow = Database["public"]["Tables"]["analyses"]["Row"]
type JobRow = Database["public"]["Tables"]["analysis_jobs"]["Row"]

export type AnalysisWithEvidence = AnalysisRow & {
  evidence: { file_name: string; storage_path: string; item_type: string } | null
}

export type StainGeometry = {
  centroid_x: number
  centroid_y: number
  major_axis: number
  minor_axis: number
  orientation_deg: number
  area_mm2: number
}

export type ExplanationPayload = {
  top_features: {
    feature: string
    plain_name: string
    importance: number
    measured_value: number | null
  }[]
  summary: string
}

/** Request analysis on an evidence photo: one analyses row + one queued job. */
export async function requestAnalysis(evidenceId: string): Promise<{
  analysisId: string | null
  error: string | null
}> {
  if (!supabase) return { analysisId: null, error: "Supabase is not configured." }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { analysisId: null, error: "Not signed in." }

  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .insert({ evidence_id: evidenceId, requested_by: userId })
    .select("id")
    .single()

  if (analysisError) return { analysisId: null, error: analysisError.message }

  // The request is not real until the job exists: the worker only sees jobs.
  const { error: jobError } = await supabase
    .from("analysis_jobs")
    .insert({ analysis_id: analysis.id })

  if (jobError) return { analysisId: analysis.id, error: jobError.message }
  return { analysisId: analysis.id, error: null }
}

async function latestJobsByAnalysis(analysisIds: string[]): Promise<Record<string, JobRow>> {
  if (!supabase || analysisIds.length === 0) return {}

  const { data, error } = await supabase
    .from("analysis_jobs")
    .select("*")
    .in("analysis_id", analysisIds)
    .order("created_at", { ascending: false })

  // A blocked read (wrong role) yields no rows, not an error — those analyses
  // simply show without pipeline state.
  if (error || !data) return {}

  const latest: Record<string, JobRow> = {}
  for (const job of data) {
    if (!latest[job.analysis_id]) latest[job.analysis_id] = job
  }
  return latest
}

/** Every analysis, newest first, each with its live pipeline state. */
export async function listAnalyses(): Promise<{
  rows: { analysis: AnalysisWithEvidence; job: JobRow | null }[]
  error: string | null
}> {
  if (!supabase) return { rows: [], error: "Supabase is not configured." }

  const { data, error } = await supabase
    .from("analyses")
    .select("*, evidence(file_name, storage_path, item_type)")
    .order("created_at", { ascending: false })

  // RLS decides which analyses come back: reviewers only ever see review/closed.
  if (error) return { rows: [], error: error.message }

  const jobs = await latestJobsByAnalysis(data.map((row) => row.id))
  return {
    rows: data.map((row) => ({
      analysis: row as AnalysisWithEvidence,
      job: jobs[row.id] ?? null,
    })),
    error: null,
  }
}

/** One analysis with its evidence, its latest job, and a viewable photo URL. */export async function fetchAnalysisDetail(analysisId: string): Promise<{
  analysis: AnalysisWithEvidence | null
  job: JobRow | null
  photoUrl: string | null
  error: string | null
}> {
  if (!supabase) {
    return { analysis: null, job: null, photoUrl: null, error: "Supabase is not configured." }
  }

  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .select("*, evidence(file_name, storage_path, item_type)")
    .eq("id", analysisId)
    .single()

  if (analysisError) {
    return { analysis: null, job: null, photoUrl: null, error: analysisError.message }
  }

  const jobs = await latestJobsByAnalysis([analysisId])
  const typed = analysis as AnalysisWithEvidence

  if (!typed.evidence) {
    return { analysis: typed, job: jobs[analysisId] ?? null, photoUrl: null, error: null }
  }

  const { data: urlData, error: urlError } = await supabase.storage
    .from("evidence")
    .createSignedUrl(typed.evidence.storage_path, 300)

  if (urlError) {
    return { analysis: typed, job: jobs[analysisId] ?? null, photoUrl: null, error: urlError.message }
  }
  return { analysis: typed, job: jobs[analysisId] ?? null, photoUrl: urlData.signedUrl, error: null }
}

export type ReviewDecision = "approved" | "rejected"

/**
 * Supervisor decision on finished work. The database owns the gate: only
 * admin/reviewer roles, only from ready_for_review, reviewed_by forced to self.
 * A rejection needs a note — the analyst must know what to redo.
 */
export async function reviewAnalysis(
  analysisId: string,
  decision: ReviewDecision,
  note: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase is not configured." }
  if (decision === "rejected" && note.trim() === "") {
    return { error: "A rejection needs a note explaining what must change." }
  }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { error: "Not signed in." }

  const { error } = await supabase
    .from("analyses")
    .update({ status: decision, reviewed_by: userId, review_note: note.trim() })
    .eq("id", analysisId)

  return { error: error?.message ?? null }
}

export type RoutableStaff = { id: string; full_name: string; role: string }

/** People an analysis can be routed to. Only admins can read profiles. */
export async function listRoutableStaff(): Promise<RoutableStaff[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["analyst", "reviewer", "admin"])
    .order("full_name")
  if (error || !data) return []
  return data
}

/** Route an analysis to one analyst (or clear the route). Admins only. */
export async function routeAnalysis(
  analysisId: string,
  assigneeId: string | null,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase is not configured." }
  const { error } = await supabase
    .from("analyses")
    .update({ assigned_to: assigneeId })
    .eq("id", analysisId)
  return { error: error?.message ?? null }
}
