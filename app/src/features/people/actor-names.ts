/**
 * actor-names.ts — turn actor UUIDs into the names a reader can actually use.
 *
 * A chain of custody that reads "by 84717a65" is not a chain of custody, it is a
 * log with the identifying part removed. Custody exists to answer *who* held the
 * evidence and *when*, so the actor has to be a person, not a primary key.
 *
 * Names come from `case_actor_names`, a SECURITY DEFINER RPC that only returns
 * people linked to a case the caller can already see. It fails closed: if the RPC
 * errors we render the short id rather than guessing from a client-side cache, so
 * the authorization decision stays in the database where the rest of it lives.
 */

import { useEffect, useState } from "react"

import { supabase } from "@/lib/supabase"

const NO_NAMES: Map<string, string> = new Map()

/** Short UUID for the rare actor the directory RPC does not name. */
export function shortId(id: string): string {
  return id.slice(0, 8)
}

/** A display name for an actor, degrading to the short id when unnamed. */
export function actorName(
  names: Map<string, string>,
  id: string | null | undefined,
): string {
  if (id === null || id === undefined) return "-"
  return names.get(id) ?? shortId(id)
}

/**
 * The people named on one case. Re-fetched whenever the case changes; a response
 * for a case the caller has already navigated away from is dropped rather than
 * overwriting the directory now on screen.
 */
export function useActorNames(caseId: string | null | undefined): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(NO_NAMES)

  useEffect(() => {
    if (!caseId || !supabase) return
    let stale = false
    supabase
      .rpc("case_actor_names", { check_case_id: caseId })
      .then(({ data, error }) => {
        if (stale || error) return
        const next = new Map<string, string>()
        for (const entry of data ?? []) {
          next.set(entry.profile_id, entry.full_name)
        }
        setNames(next)
      })
    return () => {
      stale = true
    }
  }, [caseId])

  return names
}
