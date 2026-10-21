"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { getListNotificationsQueryKey, useListNotifications } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

// Shared unread-alert shortcut for the top-right corner of important screens.
export function AlertsButton({ className }: { className?: string }) {
  const notifications = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), refetchInterval: 30_000 },
  });
  const unread = (notifications.data ?? []).filter((note) => !note.read).length;

  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}
      title="Alerts"
      data-testid="link-alerts"
      className={cn(
        "relative grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-card text-foreground transition-colors hover:bg-muted",
        className,
      )}
    >
      <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
      {unread ? (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-primary px-1 text-center font-mono text-[10px] font-bold leading-[18px] text-primary-foreground" aria-hidden="true">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
