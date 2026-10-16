/**
 * analysis-detail-page.tsx — one analysis: the photo with its stains drawn on,
 * the verdict, and the pipeline state.
 * Owner: D5 (Farhana Yesmin). Serves FR1.5 (per-stain geometry, drawn), FR1.6
 * (label + per-class confidence + explanation), and NFR1.6/1.7 (inconclusive
 * reads as inconclusive, with the reason, never as a guess).
 *
 * The approval step (FR1.7's gate) lands in T-011 — this page shows the review
 * state but offers no approve button yet.
 */

import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  fetchAnalysisDetail,
  type AnalysisWithEvidence,
  type ExplanationPayload,
  type StainGeometry,
} from "@/features/analyses/analyses"
import { ResultCard } from "@/features/analyses/result-card"
import { StainOverlay } from "@/features/analyses/stain-overlay"
import type { Database } from "@/lib/database.types"

type JobRow = Database["public"]["Tables"]["analysis_jobs"]["Row"]

function asRecord(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  const record: Record<string, number> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number") record[key] = entry
  }
  return record
}

function asExplanation(value: unknown): ExplanationPayload | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.summary !== "string" || !Array.isArray(record.top_features)) return null
  return record as unknown as ExplanationPayload
}

function asStains(value: unknown): StainGeometry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is StainGeometry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).centroid_x === "number" &&
      typeof (entry as Record<string, unknown>).centroid_y === "number",
  )
}

export function AnalysisDetailPage() {
  const { analysisId } = useParams<{ analysisId: string }>()
  const [analysis, setAnalysis] = useState<AnalysisWithEvidence | null>(null)
  const [job, setJob] = useState<JobRow | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)

  const reload = useCallback(() => {
    if (!analysisId) return
    setIsLoading(true)
    fetchAnalysisDetail(analysisId).then(({ analysis: row, job: jobRow, photoUrl: url, error }) => {
      setAnalysis(row)
      setJob(jobRow)
      setPhotoUrl(url)
      setLoadError(error)
      setIsLoading(false)
    })
  }, [analysisId])

  useEffect(() => {
    reload()
  }, [reload])

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading analysis…</p>
  }

  if (loadError || !analysis) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? "Analysis not found."}
      </p>
    )
  }

  const verdict = analysis.verdict
  const explanation = asExplanation(analysis.explanation)
  const stains = asStains(analysis.stains)
  const hasResult = verdict !== null && explanation !== null

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/analyses" className="text-sm text-muted-foreground hover:text-foreground">
        ← All analyses
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {analysis.evidence?.file_name ?? "Analysis"}
        </h1>
        <Badge variant="outline">{analysis.status.replaceAll("_", " ")}</Badge>
        {job ? <Badge variant="outline">job {job.status}</Badge> : null}
      </div>

      {!hasResult ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {job
                ? `The engine has not finished yet — job is ${job.status}${
                    job.last_error ? `: ${job.last_error}` : ""
                  }. This page updates when you reload.`
                : "Queued. Start the sidecar and the worker to process it."}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={reload}>
              Reload
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {photoUrl ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Evidence photo — detected stains</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOverlay((visible) => !visible)}
                >
                  {showOverlay ? "Hide outlines" : "Show outlines"}
                </Button>
              </div>
              <StainOverlay
                photoUrl={photoUrl}
                fileName={analysis.evidence?.file_name ?? "evidence"}
                stains={stains}
                showOverlay={showOverlay}
              />
            </div>
          ) : null}

          <ResultCard
            verdict={verdict ?? "inconclusive"}
            confidence={analysis.confidence ?? 0}
            probabilities={asRecord(analysis.probabilities)}
            explanation={explanation}
            stainCount={analysis.stain_count ?? 0}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provenance</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                Model <strong className="text-foreground">bpa-catboost-v1</strong>
                {analysis.model_sha256 ? ` · sha256 ${analysis.model_sha256.slice(0, 12)}…` : ""}
              </p>
              {analysis.timing_ms !== null ? (
                <p>Analyzed in {(analysis.timing_ms / 1000).toFixed(1)}s (budget: 5s).</p>
              ) : null}
              {job?.attempts ? <p>Worker attempts: {job.attempts}.</p> : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
