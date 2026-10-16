/**
 * cases-page.tsx — case list + create form.
 * Owner: D2 (Md Galib Mahmud Aofi). Serves FR1.1 (authorized user creates a case with
 * a unique identifier, title, and description).
 *
 * The create form only renders for admins and lead investigators. Everyone else sees
 * the list alone — and RLS would reject their insert anyway, so the hidden form is
 * convenience, not security.
 */

import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useMyRole } from "@/features/auth/use-my-role"
import { createCase, listCases } from "@/features/cases/cases"
import type { Database } from "@/lib/database.types"

type CaseRow = Database["public"]["Tables"]["cases"]["Row"]

const CAN_CREATE = new Set(["admin", "lead_investigator"])

export function CasesPage() {
  const navigate = useNavigate()
  const { role } = useMyRole()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    listCases().then(({ cases: rows, error }) => {
      setCases(rows)
      setLoadError(error)
      setIsLoading(false)
    })
  }, [])

  async function submitNewCase() {
    setIsSubmitting(true)
    setFormError(null)
    const { caseId, error } = await createCase({ title, description })
    setIsSubmitting(false)
    if (error || !caseId) {
      setFormError(error ?? "Could not create the case.")
      return
    }
    void navigate(`/cases/${caseId}`)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Cases</h1>

      {role && CAN_CREATE.has(role) ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Open a new case</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submitNewCase()
              }}
            >
              <Input
                placeholder="Case title — e.g. Warehouse burglary, Bay 3"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-label="Case title"
                required
              />
              <Input
                placeholder="Short description of the scene"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-label="Case description"
              />
              {formError ? (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" disabled={isSubmitting} className="w-fit">
                {isSubmitting ? "Creating…" : "Create case"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading cases…</p>
      ) : loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : cases.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No cases yet. Open the first one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {cases.map((caseRow) => (
            <li key={caseRow.id}>
              <Link to={`/cases/${caseRow.id}`}>
                <Card className="transition-colors hover:border-foreground/30">
                  <CardContent className="flex items-center gap-4 pt-6">
                    <div className="flex-1">
                      <p className="font-medium">{caseRow.title}</p>
                      <p className="text-xs text-muted-foreground">{caseRow.case_number}</p>
                    </div>
                    <Badge variant="outline">{caseRow.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
