import { cn } from "@/lib/utils";

// Editorial page header: kicker + display title + optional actions.
export function PageHeader({ kicker, title, sub, actions, className }: {
  kicker: string; title: string; sub?: string; actions?: React.ReactNode; className?: string;
}) {
  return (
    <header className={cn("rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">{kicker}</p>
        <h1 className="font-display mt-1 text-3xl font-bold sm:text-4xl">{title}</h1>
        {sub ? <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
