/**
 * notification-bell.tsx - the sidebar bell with the unread badge.
 * Owner: D4 (Most. Mosaddika Mim). Serves T-014.
 *
 * Polls every 30 seconds and refreshes whenever the panel opens, so a badge
 * raised by another role''s action shows up without a reload. Clicking an item
 * marks it read and follows its link; the link targets are the existing case,
 * analysis, and custody routes, so a badge is always one click from context.
 */

import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Bell } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/features/notifications/notifications"

const KIND_LABELS: Record<string, string> = {
  assignment: "Assignment",
  analysis_ready: "Ready",
  decision: "Decision",
  custody_transfer: "Custody",
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [isOpen, setIsOpen] = useState(false)

  const refresh = useCallback(async () => {
    const { items: loaded } = await listNotifications()
    setItems(loaded)
  }, [])

  useEffect(() => {
    // The only setState on this path is behind the await inside refresh(); the
    // rule sees the call, not the microtask. Polling an external system is what
    // an effect is for, and the alternative is a state library for five rows.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    return () => clearInterval(timer)
  }, [refresh])

  const unread = items.filter((item) => item.readAt === null)

  async function openItem(id: string) {
    await markNotificationRead(id)
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    )
    setIsOpen(false)
  }

  async function markAllRead() {
    await markAllNotificationsRead()
    void refresh()
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={() => {
          setIsOpen((open) => !open)
          void refresh()
        }}
        aria-label={"Notifications" + (unread.length > 0 ? " (" + unread.length + " unread)" : "")}
      >
        <Bell className="mr-2 size-4" />
        Notifications
        {unread.length > 0 ? (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {unread.length}
          </span>
        ) : null}
      </Button>
      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-md border bg-popover p-2 shadow-md">
          {unread.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mb-1 w-full text-xs"
              onClick={() => void markAllRead()}
            >
              Mark all read
            </Button>
          ) : null}
          {items.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Nothing yet. Assignments, verdicts, and custody moves land here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.id}>
                  {item.link !== "" ? (
                    <Link
                      to={item.link}
                      onClick={() => void openItem(item.id)}
                      className={
                        "block rounded-md px-2 py-1.5 text-xs hover:bg-secondary " +
                        (item.readAt === null ? "font-semibold" : "text-muted-foreground")
                      }
                    >
                      <span className="mb-0.5 inline-block rounded bg-secondary px-1.5 py-px text-[10px] font-medium">
                        {kindLabel(item.kind)}
                      </span>
                      <span className="block">{item.title}</span>
                      {item.detail !== "" ? (
                        <span className="block font-normal">{item.detail}</span>
                      ) : null}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void openItem(item.id)}
                      className={
                        "block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary " +
                        (item.readAt === null ? "font-semibold" : "text-muted-foreground")
                      }
                    >
                      <span className="mb-0.5 inline-block rounded bg-secondary px-1.5 py-px text-[10px] font-medium">
                        {kindLabel(item.kind)}
                      </span>
                      <span className="block">{item.title}</span>
                      {item.detail !== "" ? (
                        <span className="block font-normal">{item.detail}</span>
                      ) : null}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}