/**
 * reports.ts - every database call the Reports module makes.
 * Owner: D4 (Most. Mosaddika Mim). Serves FR1.8 (one-click PDF case report).
 *
 * The report assembles four sections the acceptance names: the evidence table
 * with hashes, the custody log, the analysis findings with confidence and
 * explanations, and the approval record. Actor UUIDs become display names
 * through the case_actor_names RPC, which only names people linked to a case
 * the caller can already see - RLS still decides every row in this file.
 */

import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/database.types"
import { actorName, shortId } from "@/features/people/actor-names"

export { actorName, shortId }

type CaseRow = Database["public"]["Tables"]["cases"]["Row"]
type EvidenceRow = Database["public"]["Tables"]["evidence"]["Row"]
type CustodyRow = Database["public"]["Tables"]["custody_events"]["Row"]
type AnalysisRow = Database["public"]["Tables"]["analyses"]["Row"]

export type CustodyEntry = CustodyRow & { file_name: string }

export type CaseReport = {
  caseRow: CaseRow
  evidence: EvidenceRow[]
  custody: CustodyEntry[]
  analyses: AnalysisRow[]
  actorNames: Map<string, string>
}

export async function fetchCaseReport(caseId: string): Promise<{
  report: CaseReport | null
  error: string | null
}> {
  if (!supabase) return { report: null, error: "Supabase is not configured." }

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .single()
  if (caseError || !caseRow) {
    return { report: null, error: caseError?.message ?? "Case not found." }
  }

  const { data: evidence, error: evidenceError } = await supabase
    .from("evidence")
    .select("*")
    .eq("case_id", caseId)
    .order("uploaded_at", { ascending: true })
  if (evidenceError) return { report: null, error: evidenceError.message }
  const evidenceRows = evidence ?? []

  const evidenceIds = evidenceRows.map((item) => item.id)
  const fileNames = new Map(evidenceRows.map((item) => [item.id, item.file_name]))

  let custody: CustodyEntry[] = []
  let analyses: AnalysisRow[] = []
  if (evidenceIds.length > 0) {
    const { data: custodyRows, error: custodyError } = await supabase
      .from("custody_events")
      .select("*")
      .in("evidence_id", evidenceIds)
      .order("acted_at", { ascending: true })
    if (custodyError) return { report: null, error: custodyError.message }
    custody = (custodyRows ?? []).map((entry) => ({
      ...entry,
      file_name: fileNames.get(entry.evidence_id) ?? shortId(entry.evidence_id),
    }))

    const { data: analysisRows, error: analysesError } = await supabase
      .from("analyses")
      .select("*")
      .in("evidence_id", evidenceIds)
      .order("created_at", { ascending: true })
    if (analysesError) return { report: null, error: analysesError.message }
    analyses = analysisRows ?? []
  }

  // Names for everyone the report mentions. The RPC fails closed: asking
  // about a case the caller cannot see raises instead of leaking names.
  const actorNames = new Map<string, string>()
  const { data: directory, error: directoryError } = await supabase.rpc(
    "case_actor_names",
    { check_case_id: caseId },
  )
  if (directoryError) return { report: null, error: directoryError.message }
  for (const entry of directory ?? []) {
    actorNames.set(entry.profile_id, entry.full_name)
  }

  return {
    report: { caseRow, evidence: evidenceRows, custody, analyses, actorNames },
    error: null,
  }
}