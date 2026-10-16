/**
 * case-detail-page.tsx — one case: its status, the move-forward button, and the full
 * transition timeline.
 * Owner: D2 (Md Galib Mahmud Aofi). Serves FR1.2 (every lifecycle transition recorded
 * with the acting user and timestamp).
 *
 * The "move" button calls the transition RPC, which writes the status change and its
 * history row in one transaction. A case shows exactly one legal next step — or none,
 * when closed.
 */

import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useMyRole } from "@/features/auth/use-my-role"
import {
  NEXT_STATUS,
  fetchCaseWithTransitions,
  transitionCase,
  type CaseStatus,
} from "@/features/cases/cases"
import type { Database } from "@/lib/database.types"

type CaseRow = Database["public"]["Tables"]["cases"]["Row"]
type TransitionRow = Database["public"]["Tables"]["case_transitions"]["Row"]

const CAN_MOVE = new Set(["admin", "lead_investigator"])

function formatTimestamp(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString()
}

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const { role } = useMyRole()
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null)
  const [transitions, setTransitions] = useState<TransitionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [isMoving, setIsMoving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)

  const reload = useCallback(() => {
    if (!caseId) return
    setIsLoading(true)
    fetchCaseWithTransitions(caseId).then(({ caseRow: row, transitions: rows, error }) => {
      setCaseRow(row)
      setTransitions(rows)
      setLoadError(error)
      setIsLoading(false)
    })
  }, [caseId])

  useEffect(() => {
    reload()
  }, [reload])

  async function moveForward(toStatus: CaseStatus) {
    if (!caseId) return
    setIsMoving(true)
    setMoveError(null)
    const { error } = await transitionCase({ caseId, toStatus, note })
    setIsMoving(false)
    if (error) {
      setMoveError(error)
      return
    }
    setNote("")
    reload()
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading case…</p>
  }

  if (loadError || !caseRow) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? "Case not found."}
      </p>
    )
  }

  const nextStatus = NEXT_STATUS[caseRow.status as CaseStatus] ?? null
  const mayMove = role !== null && CAN_MOVE.has(role) && nextStatus !== null

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/cases" className="text-sm text-muted-foreground hover:text-foreground">
        ← All cases
      </Link>
      <div className="mb-6 mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{caseRow.title}</h1>
        <Badge variant="outline">{caseRow.status}</Badge>
      </div>
      <p className="mb-1 text-sm text-muted-foreground">{caseRow.case_number}</p>
      {caseRow.description ? (
        <p className="mb-6 text-sm">{caseRow.description}</p>
      ) : null}

      {mayMove && nextStatus ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Move to {nextStatus}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void moveForward(nextStatus)
              }}
            >
              <Input
                placeholder="Note for the record (optional) — why is it moving?"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                aria-label="Transition note"
              />
              {moveError ? (
                <p className="text-sm text-destructive" role="alert">
                  {moveError}
                </p>
              ) : null}
              <Button type="submit" disabled={isMoving} className="w-fit">
                {isMoving ? "Moving…" : `Move to ${nextStatus}`}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transitions yet — this case is still {caseRow.status}.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {transitions.map((transition) => (
                <li key={transition.id} className="flex gap-3 text-sm">
                  <span className="mt-0.5 size-2 shrink-0 rounded-full bg-foreground/60" />
                  <div>
                    <p>
                      <strong>
                        {transition.from_status} → {transition.to_status}
                      </strong>{" "}
                      <span className="text-muted-foreground">
                        {formatTimestamp(transition.transitioned_at)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      by {transition.acted_by.slice(0, 8)}
                      {transition.note ? ` — ${transition.note}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
