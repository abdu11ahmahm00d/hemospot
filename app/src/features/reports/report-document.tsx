/**
 * report-document.tsx - the forensic case report as a React component tree.
 * Owner: D4 (Most. Mosaddika Mim). Serves FR1.8.
 *
 * Rendered to PDF with @react-pdf/renderer, so the report is code we can
 * read, not a template in a system we do not control. Four sections, matching
 * the acceptance: evidence with hashes, custody log, findings with confidence
 * and explanations, and the approval record. Every number comes from the
 * database row; nothing is invented here.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import { actorName, type CaseReport } from "@/features/reports/reports"

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#555555", marginBottom: 12 },
  heading: {
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    paddingBottom: 3,
  },
  paragraph: { marginBottom: 4, lineHeight: 1.4 },
  muted: { color: "#555555" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#eeeeee",
    fontWeight: "bold",
    padding: 4,
  },
  tableRow: {
    flexDirection: "row",
    padding: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
  },
  cellWide: { flex: 3, paddingRight: 6 },
  cell: { flex: 2, paddingRight: 6 },
  cellNarrow: { flex: 1, paddingRight: 6 },
  mono: { fontFamily: "Courier", fontSize: 7, lineHeight: 1.3 },
  card: { marginTop: 8, padding: 8, borderWidth: 1, borderColor: "#dddddd" },
  empty: { color: "#777777", fontStyle: "italic" },
})

type ExplanationFeature = {
  plain_name?: string
  importance?: number
  measured_value?: number | null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>
  return {}
}

function formatPercent(fraction: number | null): string {
  if (fraction === null) return "-"
  return (fraction * 100).toFixed(1) + "%"
}

function formatMeasured(value: number | null | undefined): string {
  if (value === null || value === undefined) return "not measurable"
  if (value === 0) return "0"
  if (Math.abs(value) >= 100) return value.toFixed(0)
  if (Math.abs(value) >= 1) return value.toFixed(1)
  return value.toFixed(3)
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString()
}

export type ReportDocumentProps = {
  report: CaseReport
  generatedBy: string
  generatedAt: string
}

export function ReportDocument({ report, generatedBy, generatedAt }: ReportDocumentProps) {
  const { caseRow, evidence, custody, analyses, actorNames } = report
  const fileNames = new Map(evidence.map((item) => [item.id, item.file_name]))
  const decided = analyses.filter(
    (analysis) => analysis.status === "approved" || analysis.status === "rejected",
  )

  return (
    <Document
      title={"Hemospot case report " + caseRow.case_number}
      author="Hemospot"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Forensic Case Report</Text>
        <Text style={styles.subtitle}>
          {"Generated " + formatTimestamp(generatedAt) + " by " + generatedBy}
        </Text>

        <Text style={styles.paragraph}>{"Case: " + caseRow.case_number}</Text>
        <Text style={styles.paragraph}>{"Title: " + caseRow.title}</Text>
        <Text style={styles.paragraph}>{"Status: " + caseRow.status}</Text>
        {caseRow.description ? (
          <Text style={styles.paragraph}>{"Notes: " + caseRow.description}</Text>
        ) : null}

        <Text style={styles.heading}>Evidence ({evidence.length})</Text>
        {evidence.length === 0 ? (
          <Text style={styles.empty}>No evidence registered on this case.</Text>
        ) : (
          <View>
            <View style={styles.tableHeader}>
              <Text style={styles.cellWide}>File</Text>
              <Text style={styles.cellNarrow}>Type</Text>
              <Text style={styles.cellNarrow}>Size</Text>
              <Text style={styles.cellWide}>SHA-256</Text>
            </View>
            {evidence.map((item) => (
              <View key={item.id} style={styles.tableRow} wrap={false}>
                <Text style={styles.cellWide}>{item.file_name}</Text>
                <Text style={styles.cellNarrow}>{item.item_type}</Text>
                <Text style={styles.cellNarrow}>{item.size_bytes + " B"}</Text>
                <Text style={[styles.cellWide, styles.mono]}>{item.sha256_hex}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.heading}>Chain of custody ({custody.length})</Text>
        {custody.length === 0 ? (
          <Text style={styles.empty}>No custody events recorded.</Text>
        ) : (
          <View>
            <View style={styles.tableHeader}>
              <Text style={styles.cell}>Time</Text>
              <Text style={styles.cellWide}>Evidence</Text>
              <Text style={styles.cell}>Action</Text>
              <Text style={styles.cell}>Actor</Text>
            </View>
            {custody.map((entry) => (
              <View key={entry.id} style={styles.tableRow} wrap={false}>
                <Text style={styles.cell}>{formatTimestamp(entry.acted_at)}</Text>
                <Text style={styles.cellWide}>{entry.file_name}</Text>
                <Text style={styles.cell}>{entry.action}</Text>
                <Text style={styles.cell}>{actorName(actorNames, entry.actor)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.heading}>Findings ({analyses.length})</Text>
        {analyses.length === 0 ? (
          <Text style={styles.empty}>No analyses requested yet.</Text>
        ) : (
          <View>
            {analyses.map((analysis) => {
              const fileName = fileNames.get(analysis.evidence_id) ?? analysis.evidence_id.slice(0, 8)
              const probabilities = asRecord(analysis.probabilities)
              const ranked = Object.entries(probabilities)
                .filter((entry): entry is [string, number] => typeof entry[1] === "number")
                .sort((a, b) => b[1] - a[1])
              const explanation = asRecord(analysis.explanation)
              const summary = typeof explanation.summary === "string" ? explanation.summary : null
              const topFeatures = Array.isArray(explanation.top_features)
                ? (explanation.top_features as ExplanationFeature[])
                : []
              return (
                <View key={analysis.id} style={styles.card} wrap={false}>
                  <Text style={styles.paragraph}>
                    {"Evidence: " + fileName + "  |  Status: " + analysis.status}
                  </Text>
                  <Text style={styles.paragraph}>
                    {"Verdict: " + (analysis.verdict ?? "pending") + "  |  Confidence: " +
                      formatPercent(analysis.confidence)}
                  </Text>
                  {ranked.length > 0 ? (
                    <Text style={styles.paragraph}>
                      {"All classes: " +
                        ranked.map(([label, p]) => label + " " + formatPercent(p)).join(", ")}
                    </Text>
                  ) : null}
                  {summary ? <Text style={styles.paragraph}>{summary}</Text> : null}
                  {topFeatures.length > 0 ? (
                    <View>
                      {topFeatures.map((feature, index) => (
                        <Text key={index} style={[styles.paragraph, styles.muted]}>
                          {"- " + (feature.plain_name ?? "feature") + " = " +
                            formatMeasured(feature.measured_value) +
                            " (importance " + (feature.importance ?? "?") + ")"}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  <Text style={[styles.paragraph, styles.muted]}>
                    {"Measured " + (analysis.stain_count ?? "?") + " stains in " +
                      (analysis.timing_ms ?? "?") + " ms  |  Model " +
                      (analysis.model_sha256 ?? "unknown").slice(0, 12)}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        <Text style={styles.heading}>Approvals ({decided.length})</Text>
        {decided.length === 0 ? (
          <Text style={styles.empty}>No supervisor decision recorded.</Text>
        ) : (
          <View>
            <View style={styles.tableHeader}>
              <Text style={styles.cellWide}>Evidence</Text>
              <Text style={styles.cellNarrow}>Decision</Text>
              <Text style={styles.cell}>Reviewer</Text>
              <Text style={styles.cellWide}>Note</Text>
            </View>
            {decided.map((analysis) => (
              <View key={analysis.id} style={styles.tableRow} wrap={false}>
                <Text style={styles.cellWide}>
                  {fileNames.get(analysis.evidence_id) ?? analysis.evidence_id.slice(0, 8)}
                </Text>
                <Text style={styles.cellNarrow}>{analysis.status}</Text>
                <Text style={styles.cell}>{actorName(actorNames, analysis.reviewed_by)}</Text>
                <Text style={styles.cellWide}>{analysis.review_note || "-"}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  )
}