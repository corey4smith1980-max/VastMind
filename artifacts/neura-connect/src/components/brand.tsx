import { cn } from "@/lib/utils";

// VastMind mark: a V drawn between two friends (coral + gold dots) meeting at one point.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden>
      <rect width="64" height="64" rx="18" fill="hsl(var(--ink))" />
      <path d="M19 21l13 23 13-23" fill="none" stroke="#f4ece0" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19" cy="21" r="5" fill="#e8562b" />
      <circle cx="45" cy="21" r="5" fill="#f5c04a" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-lg font-bold leading-none tracking-tight", className)}>
      Vast<span className="text-primary">Mind</span>
    </span>
  );
}
