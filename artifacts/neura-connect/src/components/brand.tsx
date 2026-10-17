import { cn } from "@/lib/utils";

// The I/A mark carries the I AM name across compact signed-in surfaces.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden>
      <rect width="64" height="64" rx="18" fill="hsl(var(--ink))" />
      <path d="M17 22h11M22.5 22v20M35 42l9-20 9 20m-14.5-8h11" fill="none" stroke="#f4ece0" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="48" r="3" fill="#e8562b" />
      <circle cx="52" cy="48" r="3" fill="#f5c04a" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-lg font-bold leading-none", className)}>
      I<span className="text-primary"> AM</span>
    </span>
  );
}
