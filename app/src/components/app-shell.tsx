/**
 * app-shell.tsx — the signed-in frame: sidebar navigation + the routed page.
 *
 * Only the navigation for the whole product; every destination is a module page owned
 * by one team member (see Hemospot README for the split).
 */

import { NavLink, Outlet } from "react-router-dom"
import {
  Briefcase,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Link2,
  LogOut,
  ScanSearch,
  Search,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useSession } from "@/features/auth/use-session"

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cases", label: "Cases", icon: Briefcase },
  { to: "/evidence", label: "Evidence", icon: FolderOpen },
  { to: "/custody", label: "Chain of custody", icon: Link2 },
  { to: "/analyses", label: "Analyses", icon: ScanSearch },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/search", label: "Search", icon: Search },
] as const

export function AppShell() {
  const { session } = useSession()

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6 px-2">
          <p className="text-lg font-semibold">Hemospot</p>
          <p className="text-xs text-muted-foreground">Blood pattern engine</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                ].join(" ")
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t pt-4">
          <p className="truncate px-2 text-xs text-muted-foreground">
            {session?.user.email ?? ""}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={() => void supabase?.auth.signOut()}
          >
            <LogOut className="mr-2 size-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
