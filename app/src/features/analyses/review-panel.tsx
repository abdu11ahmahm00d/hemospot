/**
 * review-panel.tsx — the supervisor gate on one analysis.
 * Owner: D4 (Mst Mim). Serves FR1.7: finished work becomes final only when a
 * supervisor approves it, and a rejection always says what must change.
 *
 * This panel is the visible half. The enforcing half lives in the database:
 * the reviewers policy allows only admin/reviewer, only from ready_for_review,
 * and the result-rewrite trigger means a reviewer can never touch the verdict
 * they are signing off on.
 */

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  reviewAnalysis,
  type AnalysisWithEvidence,
  type ReviewDecision,
} from "@/features/analyses/analyses"

const CAN_REVIEW = new Set(["admin", "reviewer"])

export function ReviewPanel({
  analysis,
  role,
  onDecided,
}: {
  analysis: AnalysisWithEvidence
  role: string | null
  onDecided: () => void
}) {
  const [note, setNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!role || !CAN_REVIEW.has(role)) return null

  async function decide(decision: ReviewDecision) {
    setIsSubmitting(true)
    setError(null)
    const { error: reviewError } = await reviewAnalysis(analysis.id, decision, note)
    setIsSubmitting(false)
    if (reviewError) {
      setError(reviewError)
      return
    }
    setNote("")
    onDecided()
  }

  if (analysis.status === "approved" || analysis.status === "rejected") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supervisor decision</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="font-medium capitalize">{analysis.status}</p>
          {analysis.review_note ? (
            <p className="mt-1 text-muted-foreground">{analysis.review_note}</p>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  if (analysis.status !== "ready_for_review") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supervisor decision</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            There is nothing to review yet — the decision opens once the engine
            finishes this analysis.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Supervisor decision</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void decide("approved")
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Review note
            <textarea
              className="min-h-20 rounded-md border border-input bg-background px-3 py-2"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Required when rejecting — what must change?"
              aria-label="Review note"
            />
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Recording…" : "Approve"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isSubmitting}
              onClick={() => void decide("rejected")}
            >
              Reject
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
