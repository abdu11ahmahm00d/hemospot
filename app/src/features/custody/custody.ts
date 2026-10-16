/**
 * custody.ts — every database call the Chain of Custody module makes.
 * Owner: D3 (Fatin Mahtab Nahin). Serves FR1.4 (every custody event — who, what,
 * when, why — in an append-only log) and NFR1.2 (100% traceable to actor,
 * timestamp, and evidence item).
 *
 * There is deliberately no update and no delete function in this file, matching
 * the database: custody_events has no UPDATE or DELETE policy for any role, so
 * editing history is impossible, not just hidden. The UI therefore offers only
 * recording and reading — the only two operations that exist.
 */

import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/database.types"

type CustodyEventRow = Database["public"]["Tables"]["custody_events"]["Row"]

export type CustodyAction = "collected" | "transferred" | "received" | "sealed" | "released"

export const CUSTODY_ACTIONS: { value: CustodyAction; label: string }[] = [
  { value: "collected", label: "Collected from scene" },
  { value: "transferred", label: "Transferred to holder" },
  { value: "received", label: "Received by holder" },
  { value: "sealed", label: "Sealed for storage" },
  { value: "released", label: "Released (court / disposal)" },
]

export async function listCustodyEvents(evidenceId: string): Promise<{
  events: CustodyEventRow[]
  error: string | null
}> {
  if (!supabase) return { events: [], error: "Supabase is not configured." }

  const { data, error } = await supabase
    .from("custody_events")
    .select("*")
    .eq("evidence_id", evidenceId)
    .order("acted_at", { ascending: true })
    .order("id", { ascending: true })

  // RLS decides visibility alongside the evidence row it belongs to.
  if (error) return { events: [], error: error.message }
  return { events: data, error: null }
}

export async function recordCustodyEvent(input: {
  evidenceId: string
  action: CustodyAction
  reason: string
}): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase is not configured." }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { error: "Not signed in." }

  // INSERT only. The actor is always the caller — impersonation is impossible
  // because the policy requires actor = auth.uid().
  const { error } = await supabase.from("custody_events").insert({
    evidence_id: input.evidenceId,
    actor: userId,
    action: input.action,
    reason: input.reason,
  })

  if (error) return { error: error.message }
  return { error: null }
}
