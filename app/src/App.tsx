/**
 * app.tsx — routes + the auth gate.
 *
 * Signed-out users see only the login page (FR1.1's authorized-user gate); signed-in
 * users get the shell with one route per module. A missing Supabase configuration shows
 * a banner instead of a broken page.
 */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/app-shell"
import { useSession } from "@/features/auth/use-session"
import { LoginPage } from "@/features/auth/login-page"
import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { CasesPage } from "@/features/cases/cases-page"
import { CaseDetailPage } from "@/features/cases/case-detail-page"
import { EvidencePage } from "@/features/evidence/evidence-page"
import { CustodyPage } from "@/features/custody/custody-page"
import { AnalysesPage } from "@/features/analyses/analyses-page"
import { ReportsPage } from "@/features/reports/reports-page"
import { SearchPage } from "@/features/search/search-page"
import { isSupabaseConfigured } from "@/lib/supabase"

export function App() {
  const { session, isLoading } = useSession()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading session…
      </div>
    )
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm">
          <p className="font-semibold text-destructive">Supabase is not configured.</p>
          <p className="mt-2 text-muted-foreground">
            Copy <code>app/.env.example</code> to <code>app/.env</code> and fill in your
            project URL and anon key (D1 owns the Supabase project). Then restart the dev
            server.
          </p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cases" element={<CasesPage />} />
          <Route path="/cases/:caseId" element={<CaseDetailPage />} />
          <Route path="/evidence" element={<EvidencePage />} />
          <Route path="/custody" element={<CustodyPage />} />
          <Route path="/analyses" element={<AnalysesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
