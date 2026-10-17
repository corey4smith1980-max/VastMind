"use client";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";

const LABEL = { live: "Live", connecting: "Connecting", reconnecting: "Reconnecting", offline: "Offline" } as const;

// Real socket connection status — no faking.
export function ConnectionPill({ compact, className }: { compact?: boolean; className?: string }) {
  const { status } = useRealtime();
  const color = status === "live" ? "bg-online" : status === "offline" ? "bg-destructive" : "bg-accent";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest", className)}
      role="status"
      aria-live="polite"
      data-testid="status-connection"
      title={`Realtime: ${LABEL[status]}`}
    >
      <span className="relative flex h-2 w-2">
        {status !== "live" ? <span className={cn("pulse-ring absolute inset-0 rounded-full", color)} /> : null}
        <span className={cn("relative h-2 w-2 rounded-full", color)} />
      </span>
      {compact ? null : LABEL[status]}
    </span>
  );
}
