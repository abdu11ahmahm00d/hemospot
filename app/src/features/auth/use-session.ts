/**
 * use-session.ts — who is signed in, and when that changes.
 *
 * Auth is Supabase's (NFR1.1): sign-in happens in the login page, Supabase issues the
 * session, and the profile row (held in the `profiles` table by the database trigger)
 * carries the role that every RLS policy checks.
 */

import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

type SessionState = {
  session: Session | null
  isLoading: boolean
}

export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null)
  // A missing client is knowable before the first paint, so the answer lives in
  // the initializer. Reading it here means the misconfigured case never flickers
  // a loading state and the effect below holds no synchronous setState.
  const [isLoading, setIsLoading] = useState(supabase !== null)

  useEffect(() => {
    if (!supabase) {
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  return { session, isLoading }
}
