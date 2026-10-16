/**
 * search.ts - every database call the Search module makes.
 * Owner: D2 (Md Galib Mahmud Aofi). Serves FR1.9 (full-text search across
 * cases and evidence metadata, filtered by the requesting user's role).
 *
 * Role filtering is not application logic: the search RPCs are SECURITY
 * INVOKER, so every candidate row passes the caller's own RLS before it can
 * appear. An analyst's results contain only assigned cases. Evidence is
 * grouped under cases the caller can see; a hit whose case is hidden by RLS
 * is dropped, never shown blind.
 */

import { supabase } from "@/lib/supabase"

export type CaseHit = {
  id: string
  case_number: string
  title: string
  description: string
  status: string
  created_at: string
  rank: number
}

export type EvidenceHit = {
  id: string
  case_id: string
  file_name: string
  item_type: string
  created_at: string
  rank: number
}

export type SearchFilters = {
  status: string | null
  itemType: string | null
  fromDate: string | null
  toDate: string | null
}

export type GroupedResults = {
  cases: { hit: CaseHit; evidence: EvidenceHit[] }[]
  orphanEvidence: EvidenceHit[]
}

/** One ranked pass over cases. An empty query matches nothing by design. */
export async function searchCases(
  query: string,
  filters: SearchFilters,
): Promise<{ rows: CaseHit[]; error: string | null }> {
  if (!supabase) return { rows: [], error: "Supabase is not configured." }
  if (query.trim() === "") return { rows: [], error: null }

  const { data, error } = await supabase.rpc("search_cases", {
    query_text: query.trim(),
    status_filter: filters.status ?? undefined,
    from_date: filters.fromDate ?? undefined,
    to_date: filters.toDate ?? undefined,
    max_rows: 50,
  })

  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as CaseHit[], error: null }
}

/** One ranked pass over evidence metadata. Same RLS guarantee as cases. */
export async function searchEvidence(
  query: string,
  filters: SearchFilters,
): Promise<{ rows: EvidenceHit[]; error: string | null }> {
  if (!supabase) return { rows: [], error: "Supabase is not configured." }
  if (query.trim() === "") return { rows: [], error: null }

  const { data, error } = await supabase.rpc("search_evidence", {
    query_text: query.trim(),
    item_type_filter: filters.itemType ?? undefined,
    from_date: filters.fromDate ?? undefined,
    to_date: filters.toDate ?? undefined,
    max_rows: 50,
  })

  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as EvidenceHit[], error: null }
}

/**
 * Both passes at once, evidence nested under its case. Evidence whose case
 * the caller cannot see stays listed separately as orphans - visible metadata
 * the caller is allowed to read, with no case details attached.
 */
export async function searchAll(
  query: string,
  filters: SearchFilters,
): Promise<{ results: GroupedResults; error: string | null }> {
  const [caseResult, evidenceResult] = await Promise.all([
    searchCases(query, filters),
    searchEvidence(query, filters),
  ])

  const error = caseResult.error ?? evidenceResult.error
  if (error) {
    return { results: { cases: [], orphanEvidence: [] }, error }
  }

  const visibleCaseIds = new Set(caseResult.rows.map((hit) => hit.id))
  const evidenceByCase = new Map<string, EvidenceHit[]>()
  const orphanEvidence: EvidenceHit[] = []

  for (const hit of evidenceResult.rows) {
    if (visibleCaseIds.has(hit.case_id)) {
      const group = evidenceByCase.get(hit.case_id) ?? []
      group.push(hit)
      evidenceByCase.set(hit.case_id, group)
    } else {
      orphanEvidence.push(hit)
    }
  }

  return {
    results: {
      cases: caseResult.rows.map((hit) => ({
        hit,
        evidence: evidenceByCase.get(hit.id) ?? [],
      })),
      orphanEvidence,
    },
    error: null,
  }
}