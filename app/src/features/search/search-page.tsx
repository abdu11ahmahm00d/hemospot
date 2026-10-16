/**
 * search-page.tsx - one box over cases and evidence metadata.
 * Owner: D2 (Md Galib Mahmud Aofi). Serves FR1.9: ranked full-text results,
 * role-filtered by RLS inside the search RPCs - an analyst's results contain
 * only assigned cases, with no application-level filtering to get wrong.
 */

import { useState } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  searchAll,
  type GroupedResults,
  type SearchFilters,
} from "@/features/search/search"

const EMPTY_RESULTS: GroupedResults = { cases: [], orphanEvidence: [] }

const NO_FILTERS: SearchFilters = {
  status: null,
  itemType: null,
  fromDate: null,
  toDate: null,
}

export function SearchPage() {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const [itemType, setItemType] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [results, setResults] = useState<GroupedResults>(EMPTY_RESULTS)
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  async function runSearch() {
    if (query.trim() === "") return
    setIsSearching(true)
    setSearchError(null)
    const { results: grouped, error } = await searchAll(query, {
      ...NO_FILTERS,
      status: status === "" ? null : status,
      itemType: itemType === "" ? null : itemType,
      fromDate: fromDate === "" ? null : new Date(fromDate).toISOString(),
      toDate: toDate === "" ? null : new Date(toDate).toISOString(),
    })
    setResults(grouped)
    setSearchError(error)
    setHasSearched(true)
    setIsSearching(false)
  }

  const totalHits =
    results.cases.length +
    results.cases.reduce((sum, group) => sum + group.evidence.length, 0) +
    results.orphanEvidence.length

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Search</h1>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void runSearch()
            }}
          >
            <div className="flex gap-2">
              <Input
                placeholder="Case numbers, titles, descriptions, file names…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search query"
              />
              <Button type="submit" disabled={isSearching || query.trim() === ""}>
                {isSearching ? "Searching…" : "Search"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                Status
                <select
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  aria-label="Case status filter"
                >
                  <option value="">Any</option>
                  <option value="open">Open</option>
                  <option value="investigate">Investigate</option>
                  <option value="review">Review</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                Evidence type
                <select
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={itemType}
                  onChange={(event) => setItemType(event.target.value)}
                  aria-label="Evidence type filter"
                >
                  <option value="">Any</option>
                  <option value="scene_photo">Scene photo</option>
                  <option value="document">Document</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                From
                <input
                  type="date"
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  aria-label="From date filter"
                />
              </label>
              <label className="flex items-center gap-2">
                To
                <input
                  type="date"
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  aria-label="To date filter"
                />
              </label>
            </div>
          </form>
        </CardContent>
      </Card>

      {searchError ? (
        <p className="text-sm text-destructive" role="alert">
          {searchError}
        </p>
      ) : null}

      {hasSearched && !searchError ? (
        totalHits === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing matches - or nothing you may see matches.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {results.cases.map(({ hit, evidence }) => (
              <Card key={hit.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                    <Link
                      to={"/cases/" + hit.id}
                      className="hover:underline"
                    >
                      {hit.title}
                    </Link>
                    <Badge variant="outline">{hit.status}</Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{hit.case_number}</p>
                </CardHeader>
                {hit.description ? (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">{hit.description}</p>
                  </CardContent>
                ) : null}
                {evidence.length > 0 ? (
                  <CardContent className="pt-0">
                    <ul className="flex flex-col gap-1 text-sm">
                      {evidence.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                          <Badge variant="secondary">{item.item_type}</Badge>
                          <span>{item.file_name}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                ) : null}
              </Card>
            ))}
            {results.orphanEvidence.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Evidence from cases outside your access
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                    {results.orphanEvidence.map((item) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <Badge variant="secondary">{item.item_type}</Badge>
                        <span>{item.file_name}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  )
}