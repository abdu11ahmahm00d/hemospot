/**
 * search-page.tsx — Search module.
 * Owner: D2 (Md Galib Mahmud Aofi). Serves FR1.9 (full-text search across cases and
 * evidence metadata, filtered by the requesting user's role).
 */

import { Search } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function SearchPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Search</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-5" /> Case & evidence search — landing W4
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Serves FR1.9: one Postgres full-text query over cases and evidence metadata.
            Role filtering is not application logic — RLS policies make the query return
            only rows the requesting user may see.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Search box over case titles/descriptions and evidence metadata</li>
            <li>Results role-filtered by RLS (an analyst never sees an unassigned case)</li>
            <li>Filters: case status, evidence type, date range</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
