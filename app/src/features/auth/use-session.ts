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
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false)
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
