/**
 * result-card.tsx — one BPA verdict, shown the way the NFRs demand.
 * Owner: D5 (Farhana Yesmin). Serves NFR1.6/NFR1.7: a label is never shown
 * without its confidence and its explanation; below-threshold output reads
 * "inconclusive" in fixed wording, never as a guess.
 */

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { ExplanationPayload } from "@/features/analyses/analyses"

const CLASS_COLORS: Record<string, string> = {
  gunshot: "bg-red-100 text-red-900",
  impact: "bg-amber-100 text-amber-900",
  low_velocity: "bg-sky-100 text-sky-900",
}

export function ResultCard({
  verdict,
  confidence,
  probabilities,
  explanation,
  stainCount,
}: {
  verdict: string
  confidence: number
  probabilities: Record<string, number>
  explanation: ExplanationPayload
  stainCount: number
}) {
  const isInconclusive = verdict === "inconclusive"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          {isInconclusive ? (
            <Badge variant="secondary" className="text-base">
              Inconclusive
            </Badge>
          ) : (
            <Badge className={`text-base ${CLASS_COLORS[verdict] ?? ""}`}>{verdict}</Badge>
          )}
          {!isInconclusive ? (
            <span className="text-sm font-normal text-muted-foreground">
              confidence {(confidence * 100).toFixed(1)}% · {stainCount}{" "}
              {stainCount === 1 ? "stain" : "stains"} measured
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">{explanation.summary}</p>

        {Object.keys(probabilities).length > 0 ? (
          <div className="flex flex-col gap-2">
            {Object.entries(probabilities)
              .sort(([, a], [, b]) => b - a)
              .map(([className, probability]) => (
                <div key={className} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">{className}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-foreground"
                      style={{ width: `${Math.round(probability * 100)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-muted-foreground">
                    {(probability * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
          </div>
        ) : null}

        {explanation.top_features.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">What decided it</p>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {explanation.top_features.map((feature) => (
                <li key={feature.feature}>
                  {feature.plain_name} (importance {feature.importance})
                  {feature.measured_value !== null ? (
                    <span className="text-foreground"> — {feature.measured_value}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
