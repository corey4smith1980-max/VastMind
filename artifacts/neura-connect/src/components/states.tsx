"use client";
import type { LucideIcon } from "lucide-react";
import { RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { basePath } from "@/lib/base";

// ---------- Boot: shown while the client-only providers load ----------
export function BootScreen() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#010102]">
      <img
        src={`${basePath}/vastmind-splash.png`}
        alt="VastMind — All your socials. One mind. Chat, connect, manage, grow."
        className="block h-auto max-h-[90dvh] w-[min(92vw,90dvh,900px)] select-none object-contain"
        draggable={false}
        fetchPriority="high"
      />
      <p className="sr-only" role="status">Loading VastMind. All your socials, one mind.</p>
    </div>
  );
}

// ---------- Empty state: composed, with a switchboard illustration ----------
export function EmptyState({
  icon: Icon, title, body, action, className,
}: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rise mx-auto flex max-w-sm flex-col items-center px-6 py-14 text-center", className)} data-testid="state-empty">
      <div className="relative mb-6 h-24 w-40">
        <svg viewBox="0 0 160 96" className="absolute inset-0 text-foreground/20" aria-hidden>
          <path d="M20 70 C 50 10, 110 10, 140 70" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6" />
          <circle cx="20" cy="70" r="6" fill="hsl(var(--primary))" />
          <circle cx="140" cy="70" r="6" fill="hsl(var(--accent))" />
        </svg>
        <div className="absolute left-1/2 top-1 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-2xl bg-card shadow-sm ring-1 ring-border">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "The line went quiet" }: { error?: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="rise mx-auto flex max-w-sm flex-col items-center px-6 py-14 text-center" role="alert" data-testid="state-error">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
        <WifiOff className="h-5 w-5 text-destructive" />
      </div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{error ? errMessage(error) : "We couldn't reach the server."}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-5 gap-2" onClick={onRetry} data-testid="button-retry">
          <RotateCw className="h-4 w-4" /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-1 p-2" aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl p-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5" style={{ width: `${45 + ((i * 17) % 35)}%` }} />
            <Skeleton className="h-3" style={{ width: `${60 + ((i * 11) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-3xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
