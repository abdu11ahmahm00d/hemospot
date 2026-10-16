/**
 * analyses-page.tsx — BPA analysis module.
 * Owner: D1 (Abdullah Mahmood). Serves FR1.5 (stain photo → detection with per-stain
 * geometric features), FR1.6 (classify into the trained classes with per-class
 * confidence), FR1.7 (routing with supervisor approval) and NFR1.3/1.6/1.7.
 */

import { ScanSearch } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function AnalysesPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Analyses</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanSearch className="size-5" /> Analysis requests — landing W3–W4
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Serves FR1.5/FR1.6 (evidence photo → verdict + confidence + explanation, from
            the FastAPI sidecar) and FR1.7 (investigator requests, analyst runs, supervisor
            approves before results are finalized).
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Request analysis on an evidence photo (creates a durable queued job)</li>
            <li>Job status: pending → processing → done (failed jobs retry — NFR1.4)</li>
            <li>Result card: verdict, confidence, top influential features with measured
                values, per-stain geometry overlay on the photo</li>
            <li>“Inconclusive” label whenever confidence is below the threshold
                (NFR1.6/NFR1.7)</li>
            <li>Supervisor approval step before a result counts as final</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
