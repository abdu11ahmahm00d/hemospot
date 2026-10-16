/**
 * dashboard-page.tsx — the landing screen: is the ML engine alive, and where does every
 * requirement stand.
 *
 * The sidecar-health card calls the FastAPI sidecar's /health directly (NFR1.3's live
 * totem: the same service that classifies evidence images). The requirement board is
 * the weekly demo's table of contents — one row per FR/NFR with its owner.
 */

import { useEffect, useState } from "react"
import { CheckCircle2, Circle, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type SidecarHealth = {
  status: string
  model_version: string
}

type RequirementRow = {
  id: string
  owner: string
  state: "scaffolded" | "building" | "done"
}

const REQUIREMENT_ROWS: RequirementRow[] = [
  { id: "FR1.1–1.2 cases + lifecycle", owner: "D2", state: "done" },
  { id: "FR1.3 evidence + SHA-256", owner: "D3", state: "done" },
  { id: "FR1.4 append-only custody", owner: "D3", state: "done" },
  { id: "FR1.5–1.6 detect + classify", owner: "D1", state: "building" },
  { id: "FR1.7 routing + approval", owner: "D4", state: "scaffolded" },
  { id: "FR1.8 PDF report", owner: "D4", state: "scaffolded" },
  { id: "FR1.9 role-filtered search", owner: "D2", state: "scaffolded" },
  { id: "NFR1.1–1.2 RBAC + custody RLS", owner: "D2+D3", state: "scaffolded" },
  { id: "NFR1.3 ≤5s analysis", owner: "D1", state: "building" },
  { id: "NFR1.4–1.5 retry + hashes", owner: "D3", state: "done" },
  { id: "NFR1.6–1.7 confidence + explanation", owner: "D1", state: "building" },
]

const STATE_ICON = {
  done: CheckCircle2,
  building: Circle,
  scaffolded: Circle,
} as const

function useSidecarHealth(): SidecarHealth | "down" | "checking" {
  const [health, setHealth] = useState<SidecarHealth | "down" | "checking">("checking")

  useEffect(() => {
    const sidecarUrl = import.meta.env.VITE_SIDECAR_URL as string | undefined
    if (!sidecarUrl) {
      setHealth("down")
      return
    }
    fetch(`${sidecarUrl}/health`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: SidecarHealth) => setHealth(data))
      .catch(() => setHealth("down"))
  }, [])

  return health
}

export function DashboardPage() {
  const health = useSidecarHealth()

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>BPA engine (sidecar)</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          {health === "checking" ? (
            <Badge variant="secondary">Checking…</Badge>
          ) : health === "down" ? (
            <>
              <XCircle className="size-5 text-destructive" />
              <span className="text-sm">
                Sidecar unreachable — analysis will show as pending. Start it with
                `uvicorn main:app --app-dir app` in <code>sidecar/</code>.
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-5 text-green-600" />
              <span className="text-sm">
                Online, model <strong>{health.model_version}</strong> (NFR1.3 budget: ≤5s
                per image)
              </span>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requirement board</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {REQUIREMENT_ROWS.map((row) => {
              const Icon = STATE_ICON[row.state]
              return (
                <li key={row.id} className="flex items-center gap-3 text-sm">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{row.id}</span>
                  <Badge variant="outline">{row.owner}</Badge>
                  <Badge variant="secondary">{row.state}</Badge>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
