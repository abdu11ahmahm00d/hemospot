/**
 * custody-page.test.tsx — one chain at a time.
 *
 * Guards a fixed bug: while the next evidence item's chain was still in
 * flight, the page rendered the previous item's events under the new
 * selection. The loaded chain is tagged with the evidence id it belongs to,
 * the render refuses any chain that does not match the current selection, and
 * this test fails if that guard is dropped.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CustodyPage } from "@/features/custody/custody-page"

// vi.mock factories run before the test module body, so the fixtures they
// close over are created inside vi.hoisted.
const fixtures = vi.hoisted(() => {
  const evidenceA = {
    id: "evidence-a",
    file_name: "knife.jpg",
    case_id: "case-1",
    cases: { case_number: "C-001" },
  }
  const evidenceB = {
    id: "evidence-b",
    file_name: "shirt.jpg",
    case_id: "case-1",
    cases: { case_number: "C-001" },
  }
  const chainA = [
    {
      id: "event-1",
      evidence_id: "evidence-a",
      actor: "user-1",
      action: "collected",
      reason: "from the scene",
      acted_at: "2026-10-01T10:00:00Z",
    },
    {
      id: "event-2",
      evidence_id: "evidence-a",
      actor: "user-1",
      action: "transferred",
      reason: "to the storage room",
      acted_at: "2026-10-02T10:00:00Z",
    },
  ]
  return { evidenceA, evidenceB, chainA }
})

vi.mock("@/features/evidence/evidence", () => ({
  listEvidence: vi.fn(async () => ({
    rows: [fixtures.evidenceA, fixtures.evidenceB],
    error: null,
  })),
}))

vi.mock("@/features/custody/custody", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/custody/custody")>()
  return {
    ...actual,
    listCustodyEvents: vi.fn((evidenceId: string) => {
      if (evidenceId === "evidence-a") {
        return Promise.resolve({ events: fixtures.chainA, error: null })
      }
      // Item B's chain stays in flight for the whole test: by the time the
      // selection has moved, the render must already have stopped showing
      // item A's events.
      return new Promise<never>(() => {})
    }),
  }
})

vi.mock("@/features/auth/use-my-role", () => ({
  useMyRole: () => ({ role: "viewer", isLoading: false }),
}))

vi.mock("@/features/people/actor-names", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/people/actor-names")>()
  return { ...actual, useActorNames: () => new Map<string, string>() }
})

describe("CustodyPage chain isolation", () => {
  it("does not render the previous item's chain while the new chain loads", async () => {
    render(<CustodyPage />)

    expect(await screen.findByText("collected")).toBeTruthy()
    expect(screen.getByText("transferred")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Evidence item"), {
      target: { value: "evidence-b" },
    })

    await waitFor(() => {
      expect(screen.queryByText("collected")).toBeNull()
      expect(screen.queryByText("transferred")).toBeNull()
    })
    expect(screen.getByText(/No custody events yet/)).toBeTruthy()
  })
})
