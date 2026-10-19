/**
 * use-session.test.ts — the session hook with no configured client.
 *
 * Guards a fixed bug: when Supabase was unconfigured, isLoading was pushed
 * true through an effect, so the app sat on a loading state instead of showing
 * the configuration notice. The initializer answers the question up front, and
 * this test fails if that regresses.
 */

import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useSession } from "@/features/auth/use-session"

vi.mock("@/lib/supabase", () => ({ supabase: null }))

describe("useSession without a configured Supabase client", () => {
  it("reports loading false on the very first render", () => {
    const { result } = renderHook(() => useSession())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.session).toBeNull()
  })
})
