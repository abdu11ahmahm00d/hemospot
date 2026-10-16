/**
 * supabase.ts — the one Supabase client for the whole app.
 *
 * Serves FR1.1–FR1.9 (every module reads and writes through this client) and NFR1.1
 * (row-level security lives in Postgres policies — the app never filters by role itself,
 * it lets Supabase enforce the permissions).
 *
 * If the environment variables are missing the client is null and the app shows a
 * configuration banner instead of crashing — a missing .env is a visible state, not a
 * silent failure.
 */

import { createClient } from "@supabase/supabase-js"

import type { Database } from "./database.types"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey)
    : null
