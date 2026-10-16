/**
 * custody-page.tsx — Chain of custody module.
 * Owner: D3 (Fatin Mahtab Nahin). Serves FR1.4 (every custody event — who, what, when,
 * why — in an append-only log that cannot be edited or deleted) and NFR1.2.
 */

import { Link2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function CustodyPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Chain of custody</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-5" /> Custody ledger — landing W3
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Serves FR1.4 and NFR1.2: append-only by design. The table has no UPDATE or
            DELETE RLS policies at all — the log cannot be edited or deleted because the
            database grants no such permission to any role.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Record a custody event: actor, evidence item, action, timestamp, reason</li>
            <li>Per-evidence custody history, newest first</li>
            <li>Custody graph view: who held what, in order</li>
            <li>Audit log of every mutation across the platform (who/what/when)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
