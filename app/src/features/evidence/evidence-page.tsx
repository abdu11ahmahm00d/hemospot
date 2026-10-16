/**
 * evidence-page.tsx — upload form plus the evidence registry list.
 * Owner: D3 (Fatin Mahtab Nahin). Serves FR1.3 (upload with SHA-256 and metadata)
 * and NFR1.5 (per-item Verify re-hashes the bytes and asks the database to compare).
 */

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useMyRole } from "@/features/auth/use-my-role"
import { listCases } from "@/features/cases/cases"
import {
  listEvidence,
  uploadEvidence,
  verifyEvidence,
  viewEvidenceUrl,
  type EvidenceItemType,
  type EvidenceWithCase,
} from "@/features/evidence/evidence"
import type { Database } from "@/lib/database.types"

type CaseRow = Database["public"]["Tables"]["cases"]["Row"]
type VerifyState = "idle" | "verifying" | "match" | "mismatch" | "error"

const CAN_UPLOAD = new Set(["admin", "lead_investigator", "analyst"])

const ITEM_TYPES: { value: EvidenceItemType; label: string }[] = [
  { value: "scene_photo", label: "Scene photo" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other" },
]

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EvidencePage() {
  const { role } = useMyRole()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [rows, setRows] = useState<EvidenceWithCase[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [caseId, setCaseId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [itemType, setItemType] = useState<EvidenceItemType>("scene_photo")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [verifyStates, setVerifyStates] = useState<Record<string, VerifyState>>({})
  const [verifyErrors, setVerifyErrors] = useState<Record<string, string>>({})

  function reload() {
    setIsLoading(true)
    Promise.all([listCases(), listEvidence()]).then(([caseResult, evidenceResult]) => {
      setCases(caseResult.cases)
      setRows(evidenceResult.rows)
      setLoadError(caseResult.error ?? evidenceResult.error)
      if (caseResult.cases.length > 0 && !caseId) setCaseId(caseResult.cases[0].id)
      setIsLoading(false)
    })
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submitUpload() {
    if (!file || !caseId) return
    setIsSubmitting(true)
    setFormError(null)
    const { error } = await uploadEvidence({ caseId, file, itemType, description })
    setIsSubmitting(false)
    if (error) {
      setFormError(error)
      return
    }
    setFile(null)
    setDescription("")
    reload()
  }

  async function verifyRow(row: EvidenceWithCase) {
    setVerifyStates((states) => ({ ...states, [row.id]: "verifying" }))
    const { matches, error } = await verifyEvidence(row)
    if (error || matches === null) {
      setVerifyStates((states) => ({ ...states, [row.id]: "error" }))
      setVerifyErrors((errors) => ({ ...errors, [row.id]: error ?? "No verdict." }))
      return
    }
    setVerifyStates((states) => ({ ...states, [row.id]: matches ? "match" : "mismatch" }))
  }

  async function viewRow(row: EvidenceWithCase) {
    const { url, error } = await viewEvidenceUrl(row.storage_path)
    if (url) window.open(url, "_blank", "noopener")
    else if (error) {
      setVerifyErrors((errors) => ({ ...errors, [row.id]: error }))
      setVerifyStates((states) => ({ ...states, [row.id]: "error" }))
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Evidence</h1>

      {role && CAN_UPLOAD.has(role) ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Register evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submitUpload()
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                Case
                <select
                  className="rounded-md border border-input bg-background px-3 py-2"
                  value={caseId}
                  onChange={(event) => setCaseId(event.target.value)}
                  aria-label="Case"
                  required
                >
                  {cases.map((caseRow) => (
                    <option key={caseRow.id} value={caseRow.id}>
                      {caseRow.case_number} — {caseRow.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                File
                <Input
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  aria-label="Evidence file"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Type
                <select
                  className="rounded-md border border-input bg-background px-3 py-2"
                  value={itemType}
                  onChange={(event) => setItemType(event.target.value as EvidenceItemType)}
                  aria-label="Evidence type"
                >
                  {ITEM_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                placeholder="Description — what is this and where was it found?"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-label="Description"
              />
              {formError ? (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" disabled={isSubmitting || !file} className="w-fit">
                {isSubmitting ? "Hashing and uploading…" : "Register evidence"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading evidence…</p>
      ) : loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No evidence registered yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const verifyState = verifyStates[row.id] ?? "idle"
            return (
              <li key={row.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.cases ? `${row.cases.case_number} — ` : ""}
                        {formatBytes(row.size_bytes)} · sha256 {row.sha256_hex.slice(0, 12)}…
                      </p>
                      {verifyState === "error" ? (
                        <p className="text-xs text-destructive" role="alert">
                          {verifyErrors[row.id]}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant="outline">{row.item_type}</Badge>
                    {verifyState === "match" ? (
                      <Badge>hash matches</Badge>
                    ) : verifyState === "mismatch" ? (
                      <Badge variant="destructive">hash mismatch</Badge>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void viewRow(row)}
                    >
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={verifyState === "verifying"}
                      onClick={() => void verifyRow(row)}
                    >
                      {verifyState === "verifying" ? "Verifying…" : "Verify"}
                    </Button>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
