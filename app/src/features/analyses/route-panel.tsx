/**
 * route-panel.tsx — route one analysis to a specific analyst.
 * Owner: D4 (Mst Mim). Serves FR1.7's routing half: an admin points the work
 * at a named analyst instead of leaving it in the shared queue.
 *
 * Only admins see this — reading the staff list requires the admin profile
 * policy. The assigned analyst's run writes still pass through the same
 * run-path policy as the shared worker.
 */

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  listRoutableStaff,
  routeAnalysis,
  type AnalysisWithEvidence,
  type RoutableStaff,
} from "@/features/analyses/analyses"

export function RoutePanel({
  analysis,
  role,
  onRouted,
}: {
  analysis: AnalysisWithEvidence
  role: string | null
  onRouted: () => void
}) {
  const [staff, setStaff] = useState<RoutableStaff[]>([])
  const [assigneeId, setAssigneeId] = useState(analysis.assigned_to ?? "")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (role === "admin") {
      void listRoutableStaff().then(setStaff)
    }
  }, [role])

  if (role !== "admin") return null
  if (analysis.status === "approved" || analysis.status === "rejected") return null

  async function save() {
    setIsSaving(true)
    setError(null)
    const { error: routeError } = await routeAnalysis(
      analysis.id,
      assigneeId === "" ? null : assigneeId,
    )
    setIsSaving(false)
    if (routeError) {
      setError(routeError)
      return
    }
    onRouted()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Route to analyst</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Assigned analyst
            <select
              className="rounded-md border border-input bg-background px-3 py-2"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              aria-label="Assigned analyst"
            >
              <option value="">Shared queue (no one assigned)</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name} — {person.role}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={isSaving}
            onClick={() => void save()}
          >
            {isSaving ? "Saving…" : "Save routing"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
