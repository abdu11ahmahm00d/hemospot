/**
 * reports-page.tsx — Reporting module.
 * Owner: D4 (Most. Mosaddika Mim). Serves FR1.8 (one-click PDF case report containing
 * evidence metadata, custody log, analyses, and approvals).
 */

import { FileText } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ReportsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Reports</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" /> Forensic reports — landing W5
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Serves FR1.8: the PDF is a React component tree rendered to PDF with
            @react-pdf/renderer — the report is code we can read, not a template in a
            system we don't control.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Report per case: evidence table with hashes, custody log, analysis
                findings with confidence and explanations, approval record</li>
            <li>Report template components (header, evidence table, custody table)</li>
            <li>In-app notifications (case assigned, analysis ready, custody transfer);
                email optional</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
