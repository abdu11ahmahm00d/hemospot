/**
 * reports-page.tsx - pick a case, get its forensic PDF.
 * Owner: D4 (Most. Mosaddika Mim). Serves FR1.8.
 *
 * One click renders evidence with hashes, the custody log, findings with
 * confidence and explanations, and the approval record. The case list itself
 * comes through RLS, so the picker never offers a case the caller may not
 * see - an analyst only ever reports on assigned work.
 */

import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { PDFDownloadLink } from "@react-pdf/renderer"
import { FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSession } from "@/features/auth/use-session"
import { listCases } from "@/features/cases/cases"
import { ReportDocument } from "@/features/reports/report-document"
import { fetchCaseReport, type CaseReport } from "@/features/reports/reports"

type CaseOption = { id: string; case_number: string; title: string }

export function ReportsPage() {
  const { session } = useSession()
  const [searchParams] = useSearchParams()
  const [options, setOptions] = useState<CaseOption[]>([])
  const [caseId, setCaseId] = useState("")
  const [report, setReport] = useState<CaseReport | null>(null)
  const [generatedAt, setGeneratedAt] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void listCases().then(({ cases }) => {
      setOptions(
        cases.map((row) => ({ id: row.id, case_number: row.case_number, title: row.title })),
      )
    })
  }, [])

  // Deep-linkable reports: /reports?case=<id> loads immediately, so a
  // supervisor can bookmark or share a case's report URL.
  useEffect(() => {
    const linkedId = searchParams.get("case")
    if (linkedId !== null && linkedId !== "") {
      void loadReport(linkedId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function loadReport(selectedId: string) {
    setCaseId(selectedId)
    setReport(null)
    if (selectedId === "") return
    setIsLoading(true)
    setLoadError(null)
    const { report: loaded, error } = await fetchCaseReport(selectedId)
    setReport(loaded)
    setLoadError(error)
    setGeneratedAt(new Date().toISOString())
    setIsLoading(false)
  }

  const selected = options.find((option) => option.id === caseId) ?? null

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Reports</h1>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" /> Forensic case report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex flex-col gap-1 text-sm">
            Case
            <select
              className="rounded-md border border-input bg-background px-3 py-2"
              value={caseId}
              onChange={(event) => void loadReport(event.target.value)}
              aria-label="Report case"
            >
              <option value="">Choose a case…</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.case_number + " - " + option.title}
                </option>
              ))}
            </select>
          </label>
          {isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Assembling report…</p>
          ) : null}
          {loadError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {loadError}
            </p>
          ) : null}
          {report && selected && !isLoading ? (
            <div className="mt-4">
              <PDFDownloadLink
                document={
                  <ReportDocument
                    report={report}
                    generatedBy={session?.user?.email ?? "unknown"}
                    generatedAt={generatedAt}
                  />
                }
                fileName={"Hemospot-" + selected.case_number + ".pdf"}
              >
                {({ loading }) => (
                  <Button disabled={loading}>
                    {loading ? "Rendering PDF…" : "Download PDF report"}
                  </Button>
                )}
              </PDFDownloadLink>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}