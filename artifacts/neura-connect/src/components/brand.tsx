import { cn } from "@/lib/utils";

// Brand mark: an "N" patched into two switchboard jacks (vermilion + saffron).
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden>
      <rect width="64" height="64" rx="18" fill="hsl(var(--ink))" />
      <path d="M18 40V24l14 16V24" fill="none" stroke="#f4ece0" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="46" cy="24" r="5" fill="#e8562b" />
      <circle cx="46" cy="40" r="5" fill="#f5c04a" />
      <path d="M32 24h9M32 40h9" stroke="#f4ece0" strokeWidth="2" strokeDasharray="2 3" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-lg font-bold leading-none", className)}>
      NeuraCore<span className="text-primary">Connect</span>
    </span>
  );
}
