/**
 * cases.ts — every database call the Cases module makes (FR1.1, FR1.2).
 *
 * Owner: D2. Reads and writes go through supabase-js; permissions are enforced by
 * RLS policies and the transition RPC, never by this file. Status changes always go
 * through `transitionCase`, which runs inside one database transaction (see migration
 * 0002) so the case row and its history row can never disagree.
 */

import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/database.types"

type CaseRow = Database["public"]["Tables"]["cases"]["Row"]
type TransitionRow = Database["public"]["Tables"]["case_transitions"]["Row"]

export type CaseStatus = "open" | "investigate" | "review" | "closed"

/** The one legal next step for each status. `closed` is terminal. */
export const NEXT_STATUS: Record<CaseStatus, CaseStatus | null> = {
  open: "investigate",
  investigate: "review",
  review: "closed",
  closed: null,
}

/** Postgres unique-violation code: a generated case number already exists. */
const UNIQUE_VIOLATION = "23505"

/** Case numbers look like HSP-2026-7KQ2: readable, sortable, unique by constraint. */
export function generateCaseNumber(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  let suffix = ""
  for (let index = 0; index < 4; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `HSP-${new Date().getFullYear()}-${suffix}`
}

export async function listCases(): Promise<{ cases: CaseRow[]; error: string | null }> {
  if (!supabase) return { cases: [], error: "Supabase is not configured." }

  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .order("created_at", { ascending: false })

  // RLS decides which rows come back: an analyst only ever sees their cases.
  if (error) return { cases: [], error: error.message }
  return { cases: data, error: null }
}

export async function createCase(input: {
  title: string
  description: string
}): Promise<{ caseId: string | null; error: string | null }> {
  if (!supabase) return { caseId: null, error: "Supabase is not configured." }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { caseId: null, error: "Not signed in." }

  // Retry on the rare case-number collision instead of failing the form.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("cases")
      .insert({
        case_number: generateCaseNumber(),
        title: input.title,
        description: input.description,
        created_by: userId,
      })
      .select("id")
      .single()

    if (!error) return { caseId: data.id, error: null }
    if (error.code !== UNIQUE_VIOLATION) return { caseId: null, error: error.message }
  }
  return { caseId: null, error: "Could not mint a unique case number. Try again." }
}

export async function fetchCaseWithTransitions(caseId: string): Promise<{
  caseRow: CaseRow | null
  transitions: TransitionRow[]
  error: string | null
}> {
  if (!supabase) return { caseRow: null, transitions: [], error: "Supabase is not configured." }

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .single()

  if (caseError) return { caseRow: null, transitions: [], error: caseError.message }

  const { data: transitions, error: transitionsError } = await supabase
    .from("case_transitions")
    .select("*")
    .eq("case_id", caseId)
    .order("transitioned_at", { ascending: true })

  if (transitionsError) {
    return { caseRow, transitions: [], error: transitionsError.message }
  }
  return { caseRow, transitions, error: null }
}

export async function transitionCase(input: {
  caseId: string
  toStatus: CaseStatus
  note: string
}): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase is not configured." }

  // One RPC = one transaction: status move + history row, or neither.
  // Refusals come back as the database's own sentences ("case is closed…").
  const { error } = await supabase.rpc("transition_case_status", {
    p_case_id: input.caseId,
    p_to_status: input.toStatus,
    p_note: input.note,
  })

  if (error) return { error: error.message }
  return { error: null }
}
