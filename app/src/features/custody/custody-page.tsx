/**
 * custody-page.tsx — record a handoff, read the chain.
 * Owner: D3 (Fatin Mahtab Nahin). Serves FR1.4 and NFR1.2: every custody event
 * (who, what, when, why) lands in the append-only log, and the chain view reads
 * oldest-first so the order of holders is the story.
 *
 * No edit and no delete controls exist on this page — matching the database,
 * which grants no such permission to any role. History can only grow.
 */

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useMyRole } from "@/features/auth/use-my-role"
import {
  CUSTODY_ACTIONS,
  listCustodyEvents,
  recordCustodyEvent,
  type CustodyAction,
} from "@/features/custody/custody"
import {
  listEvidence,
  type EvidenceWithCase,
} from "@/features/evidence/evidence"
import type { Database } from "@/lib/database.types"

type CustodyEventRow = Database["public"]["Tables"]["custody_events"]["Row"]

const CAN_RECORD = new Set(["admin", "lead_investigator", "analyst"])

function formatTimestamp(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString()
}

export function CustodyPage() {
  const { role } = useMyRole()
  const [evidenceRows, setEvidenceRows] = useState<EvidenceWithCase[]>([])
  const [evidenceId, setEvidenceId] = useState("")
  const [events, setEvents] = useState<CustodyEventRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [action, setAction] = useState<CustodyAction>("transferred")
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    listEvidence().then(({ rows, error }) => {
      setEvidenceRows(rows)
      setLoadError(error)
      if (rows.length > 0) setEvidenceId(rows[0].id)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!evidenceId) {
      setEvents([])
      return
    }
    listCustodyEvents(evidenceId).then(({ events: rows, error }) => {
      setEvents(rows)
      if (error) setLoadError(error)
    })
  }, [evidenceId])

  async function submitHandoff() {
    if (!evidenceId) return
    setIsSubmitting(true)
    setFormError(null)
    const { error } = await recordCustodyEvent({ evidenceId, action, reason })
    setIsSubmitting(false)
    if (error) {
      setFormError(error)
      return
    }
    setReason("")
    listCustodyEvents(evidenceId).then(({ events: rows, error: reloadError }) => {
      setEvents(rows)
      if (reloadError) setLoadError(reloadError)
    })
  }

  const selectedEvidence = evidenceRows.find((row) => row.id === evidenceId) ?? null

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Chain of custody</h1>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading custody records…</p>
      ) : loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : evidenceRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No evidence registered yet — custody starts on the Evidence page.
        </p>
      ) : (
        <>
          <label className="mb-6 flex flex-col gap-1 text-sm">
            Evidence item
            <select
              className="rounded-md border border-input bg-background px-3 py-2"
              value={evidenceId}
              onChange={(event) => setEvidenceId(event.target.value)}
              aria-label="Evidence item"
            >
              {evidenceRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.file_name}
                  {row.cases ? ` — ${row.cases.case_number}` : ""}
                </option>
              ))}
            </select>
          </label>

          {role && CAN_RECORD.has(role) ? (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Record a handoff</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void submitHandoff()
                  }}
                >
                  <label className="flex flex-col gap-1 text-sm">
                    Action
                    <select
                      className="rounded-md border border-input bg-background px-3 py-2"
                      value={action}
                      onChange={(event) =>
                        setAction(event.target.value as CustodyAction)
                      }
                      aria-label="Custody action"
                    >
                      {CUSTODY_ACTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    placeholder="Why — e.g. moved to analyst Aofi for examination"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    aria-label="Handoff reason"
                    required
                  />
                  {formError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {formError}
                    </p>
                  ) : null}
                  <Button type="submit" disabled={isSubmitting} className="w-fit">
                    {isSubmitting ? "Recording…" : "Record handoff"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>
                Chain{" "}
                {selectedEvidence ? (
                  <span className="text-sm font-normal text-muted-foreground">
                    {selectedEvidence.file_name} · {events.length}{" "}
                    {events.length === 1 ? "event" : "events"} · append-only
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No custody events yet — record the first handoff above.
                </p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {events.map((event, index) => (
                    <li key={event.id} className="flex gap-3 text-sm">
                      <div className="flex flex-col items-center">
                        <span className="mt-1 size-2 shrink-0 rounded-full bg-foreground/60" />
                        {index < events.length - 1 ? (
                          <span className="w-px flex-1 bg-border" aria-hidden="true" />
                        ) : null}
                      </div>
                      <div className="pb-4">
                        <p>
                          <strong>{event.action}</strong>{" "}
                          <span className="text-muted-foreground">
                            {formatTimestamp(event.acted_at)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          by {event.actor.slice(0, 8)}
                          {event.reason ? ` — ${event.reason}` : ""}
                        </p>
                        <Badge variant="outline" className="mt-1">
                          #{index + 1} in chain
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
