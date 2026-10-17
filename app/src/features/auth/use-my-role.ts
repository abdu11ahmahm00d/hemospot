/**
 * use-my-role.ts — the signed-in user's role, for showing or hiding actions.
 *
 * The role lives on the `profiles` row the database trigger created at signup.
 * This hook only decides what the UI *shows*. Enforcement lives in RLS policies
 * and the transition RPC — hiding a button never grants or denies anything.
 */

import { useEffect, useState } from "react"

import { supabase } from "@/lib/supabase"

export type UserRole =
  | "admin"
  | "lead_investigator"
  | "analyst"
  | "reviewer"
  | "viewer"

type RoleState = {
  role: UserRole | null
  isLoading: boolean
}

export function useMyRole(): RoleState {
  const [role, setRole] = useState<UserRole | null>(null)
  // Knowable before the first paint, so it belongs in the initializer rather than
  // being pushed in from the effect below as a synchronous setState.
  const [isLoading, setIsLoading] = useState(supabase !== null)

  useEffect(() => {
    const client = supabase
    if (!client) {
      return
    }

    client.auth
      .getUser()
      .then(({ data }) => {
        const userId = data.user?.id
        if (!userId) {
          setIsLoading(false)
          return null
        }
        return client
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single()
      })
      .then((profile) => {
        if (profile?.data) setRole(profile.data.role as UserRole)
        setIsLoading(false)
      })
  }, [])

  return { role, isLoading }
}
