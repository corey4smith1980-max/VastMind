import { cn } from "@/lib/utils";
import { AlertsButton } from "@/components/shell/alerts-button";

// Editorial page header: kicker + display title + optional actions.
export function PageHeader({ kicker, title, sub, actions, className, showAlerts = true }: {
  kicker: string; title: string; sub?: string; actions?: React.ReactNode; className?: string; showAlerts?: boolean;
}) {
  return (
    <header className={cn("rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">{kicker}</p>
        <h1 className="font-display mt-1 text-3xl font-bold sm:text-4xl">{title}</h1>
        {sub ? <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      {showAlerts || actions ? <div className="flex items-center gap-2 self-end">{showAlerts ? <AlertsButton /> : null}{actions}</div> : null}
    </header>
  );
}
