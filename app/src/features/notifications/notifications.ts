/**
 * notifications.ts - every database call the Notifications module makes.
 * Owner: D4 (Most. Mosaddika Mim). Serves T-014 (in-app badges).
 *
 * Rows are raised by database triggers, never by client code - there is no
 * insert policy on this table, so this file only reads and marks read. The
 * payload carries three keys (title, detail, link); anything else in it is
 * ignored here rather than trusted.
 */

import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/database.types"

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"]

export type NotificationItem = {
  id: string
  kind: string
  title: string
  detail: string
  link: string
  readAt: string | null
  createdAt: string
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function toItem(row: NotificationRow): NotificationItem {
  const payload =
    typeof row.payload === "object" && row.payload !== null
      ? (row.payload as Record<string, unknown>)
      : {}
  return {
    id: row.id,
    kind: row.kind,
    title: asText(payload.title),
    detail: asText(payload.detail),
    link: asText(payload.link),
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

export async function listNotifications(limit = 30): Promise<{
  items: NotificationItem[]
  error: string | null
}> {
  if (!supabase) return { items: [], error: "Supabase is not configured." }
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) return { items: [], error: error.message }
  return { items: (data ?? []).map(toItem), error: null }
}

export async function markNotificationRead(id: string): Promise<string | null> {
  if (!supabase) return "Supabase is not configured."
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
  return error?.message ?? null
}

export async function markAllNotificationsRead(): Promise<string | null> {
  if (!supabase) return "Supabase is not configured."
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return "Not signed in."
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.user.id)
    .is("read_at", null)
  return error?.message ?? null
}