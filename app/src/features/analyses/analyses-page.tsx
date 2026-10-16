/**
 * analyses-page.tsx — request BPA analysis, track every request.
 * Owner: D5 (Farhana Yesmin). Serves FR1.5/FR1.6 (a photo becomes a queued job,
 * the worker returns verdict + confidence + explanation) and FR1.7 (only
 * investigators request; the review step lands in T-011).
 *
 * The request form renders for admins and lead investigators only — and RLS
 * would reject anyone else's insert anyway. A dead sidecar or worker shows as
 * "pending", never as a crash: the app never calls the engine directly.
 */

import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMyRole } from "@/features/auth/use-my-role"
import {
  listAnalyses,
  requestAnalysis,
  type AnalysisWithEvidence,
} from "@/features/analyses/analyses"
import { listEvidence, type EvidenceWithCase } from "@/features/evidence/evidence"
import type { Database } from "@/lib/database.types"

type JobRow = Database["public"]["Tables"]["analysis_jobs"]["Row"]

const CAN_REQUEST = new Set(["admin", "lead_investigator"])

function pipelineLabel(analysis: AnalysisWithEvidence, job: JobRow | null): string {
  if (analysis.status === "requested" && job) return `queued — ${job.status}`
  return analysis.status.replaceAll("_", " ")
}

export function AnalysesPage() {
  const navigate = useNavigate()
  const { role } = useMyRole()
  const [rows, setRows] = useState<{ analysis: AnalysisWithEvidence; job: JobRow | null }[]>([])
  const [photos, setPhotos] = useState<EvidenceWithCase[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [evidenceId, setEvidenceId] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listAnalyses(), listEvidence()]).then(([analysisResult, evidenceResult]) => {
      setRows(analysisResult.rows)
      const scenePhotos = evidenceResult.rows.filter((row) => row.item_type === "scene_photo")
      setPhotos(scenePhotos)
      setLoadError(analysisResult.error ?? evidenceResult.error)
      if (scenePhotos.length > 0) setEvidenceId(scenePhotos[0].id)
      setIsLoading(false)
    })
  }, [])

  async function submitRequest() {
    if (!evidenceId) return
    setIsSubmitting(true)
    setFormError(null)
    const { analysisId, error } = await requestAnalysis(evidenceId)
    setIsSubmitting(false)
    if (error || !analysisId) {
      setFormError(error ?? "Could not request analysis.")
      return
    }
    void navigate(`/analyses/${analysisId}`)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Analyses</h1>

      {role && CAN_REQUEST.has(role) ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Request analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scene photos yet — register one on the Evidence page first.
              </p>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitRequest()
                }}
              >
                <label className="flex flex-col gap-1 text-sm">
                  Scene photo
                  <select
                    className="rounded-md border border-input bg-background px-3 py-2"
                    value={evidenceId}
                    onChange={(event) => setEvidenceId(event.target.value)}
                    aria-label="Scene photo"
                    required
                  >
                    {photos.map((photo) => (
                      <option key={photo.id} value={photo.id}>
                        {photo.file_name}
                        {photo.cases ? ` — ${photo.cases.case_number}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {formError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                ) : null}
                <Button type="submit" disabled={isSubmitting} className="w-fit">
                  {isSubmitting ? "Queueing…" : "Request analysis"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading analyses…</p>
      ) : loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No analyses requested yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ analysis, job }) => (
            <li key={analysis.id}>
              <Link to={`/analyses/${analysis.id}`}>
                <Card className="transition-colors hover:border-foreground/30">
                  <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {analysis.evidence?.file_name ?? "Evidence removed"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {analysis.verdict && analysis.verdict !== "inconclusive"
                          ? `${analysis.verdict} · ${((analysis.confidence ?? 0) * 100).toFixed(1)}%`
                          : pipelineLabel(analysis, job)}
                      </p>
                    </div>
                    {analysis.verdict ? (
                      <Badge
                        variant={analysis.verdict === "inconclusive" ? "secondary" : "default"}
                      >
                        {analysis.verdict}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{pipelineLabel(analysis, job)}</Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
