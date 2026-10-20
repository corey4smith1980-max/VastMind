"use client";
import { ChevronLeft, ChevronRight, Package, Star } from "lucide-react";
import type { CommerceOrder } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/commerce";
import { cn } from "@/lib/utils";

export const selectClass = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";

export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-mono text-[10px] font-semibold uppercase tracking-[.22em] text-primary", className)}>{children}</p>;
}

export function StatusPill({ status }: { status: CommerceOrder["status"] }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", ORDER_STATUS_TONE[status])} data-testid="status-order">
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{ORDER_STATUS_LABEL[status]}
  </span>;
}

export function Thumb({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt={alt} loading="lazy" className={cn("object-cover", className)} />
    : <span className={cn("grid place-items-center bg-[linear-gradient(135deg,hsl(var(--brand-cyan)/.18),hsl(var(--brand-violet)/.2))] text-primary/70", className)} aria-hidden><Package className="h-1/3 w-1/3 min-h-4 min-w-4" /></span>;
}

export function Stars({ value, size = "h-3.5 w-3.5" }: { value: number; size?: string }) {
  return <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn(size, i <= Math.round(value) ? "fill-[hsl(var(--brand-magenta))] text-[hsl(var(--brand-magenta))]" : "text-muted-foreground/40")} />)}
  </span>;
}

/** Cursor pager: cursors are opaque; we keep a stack to allow going back. */
export function Pager({ stack, next, onChange, label }: { stack: string[]; next?: string; onChange: (s: string[]) => void; label: string }) {
  if (!stack.length && !next) return null;
  return <nav className="mt-4 flex items-center justify-between gap-2" aria-label={`${label} pages`}>
    <Button variant="outline" size="sm" className="rounded-full" disabled={!stack.length} onClick={() => onChange(stack.slice(0, -1))} data-testid="button-page-prev"><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
    <span className="font-mono text-[11px] text-muted-foreground">Page {stack.length + 1}</span>
    <Button variant="outline" size="sm" className="rounded-full" disabled={!next} onClick={() => next && onChange([...stack, next])} data-testid="button-page-next">Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
  </nav>;
}

export function Metric({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return <div className={cn("rise rounded-[1.4rem] border bg-card p-4", tone)}>
    <p className="text-xs opacity-75">{label}</p>
    <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</p>
    {hint ? <p className="mt-1 text-[11px] opacity-60">{hint}</p> : null}
  </div>;
}
