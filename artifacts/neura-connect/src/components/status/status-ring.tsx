"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleDashed } from "lucide-react";
import { useListStatuses, getListStatusesQueryKey, type Status } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";

/** Filters out statuses whose expiry has passed, even when the cache is stale. */
export function activeStatuses(list: Status[] | undefined, now = Date.now()) {
  return (list ?? []).filter((s) => new Date(s.expiresAt).getTime() > now);
}


/** Re-renders exactly when the nearest status expires, so stale/offline cache data still drops expired entries. */
export function useExpiryNow(list: Status[] | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = Date.now();
    if ((list ?? []).some((s) => { const e = new Date(s.expiresAt).getTime(); return e > now && e <= t; })) { setNow(t); return; }
    const next = Math.min(...(list ?? []).map((s) => new Date(s.expiresAt).getTime()).filter((e) => e > t));
    if (!Number.isFinite(next)) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(next - t + 50, 2_147_000_000));
    return () => clearTimeout(id);
  }, [list, now]);
  return now;
}

/** Shared query: same key as the Statuses page, refetched every 30s. */
export function useActiveStatuses() {
  const q = useListStatuses({ query: { queryKey: getListStatusesQueryKey(), refetchInterval: 30_000 } });
  const now = useExpiryNow(q.data);
  const active = useMemo(() => activeStatuses(q.data, now), [q.data, now]);
  return { ...q, active };
}

/** Animated cyan → blue → violet ring around an avatar. `active=false` renders a quiet grey ring. */
export function StatusRing({ active, children, thickness = 2.5, className }: { active: boolean; children: ReactNode; thickness?: number; className?: string }) {
  return <span className={cn("vm-status-ring shrink-0", className)} data-state={active ? "active" : "idle"} style={{ padding: thickness }}>
    <span className="vm-status-inner bg-card" style={{ padding: thickness }}>{children}</span>
  </span>;
}

/** Statuses returned here are server-filtered to the signed-in user and reciprocal follows. */
export function MutualStatusStrip({ meId }: { meId: string }) {
  const statuses = useActiveStatuses();
  const contacts = useMemo(() => {
    const byAuthor = new Map<string, Status[]>();
    for (const status of statuses.active) {
      if (status.author.id === meId) continue;
      byAuthor.set(status.author.id, [...(byAuthor.get(status.author.id) ?? []), status]);
    }
    return Array.from(byAuthor.values())
      .map((items) => items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      .sort((a, b) => new Date(b[0].createdAt).getTime() - new Date(a[0].createdAt).getTime());
  }, [statuses.active, meId]);

  if (!statuses.isLoading && contacts.length === 0) return null;
  return (
    <section className="mt-4" aria-label="Mutual contacts' active statuses" data-testid="mutual-status-strip">
      <p className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Mutual statuses</p>
      {statuses.isLoading && contacts.length === 0 ? <p className="text-xs text-muted-foreground">Checking for status updates…</p> : (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
          {contacts.map((items) => {
            const latest = items[0];
            return (
              <Link key={latest.author.id} href={`/statuses?authorId=${encodeURIComponent(latest.author.id)}`}
                aria-label={`View ${latest.author.name}'s ${items.length} status ${items.length === 1 ? "update" : "updates"}`}
                className="flex min-w-[54px] flex-col items-center gap-1.5 rounded-xl p-1 text-center hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`link-mutual-status-${latest.author.id}`}>
                <StatusRing active className="h-12 w-12">
                  <UserAvatar id={latest.author.id} name={latest.author.name} src={latest.author.avatarUrl} size="sm" />
                </StatusRing>
                <span className="max-w-[68px] truncate text-[10px] font-medium text-foreground">{latest.author.name.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Header shortcut on unified Videos: shows live status activity and links to /statuses. */
export function StatusShortcut({ meId }: { meId?: string }) {
  const { active } = useActiveStatuses();
  const authors = new Set(active.map((s) => s.author.id));
  const others = [...authors].filter((a) => a !== meId).length;
  const has = authors.size > 0;
  const label = has ? `Statuses: ${authors.size} ${authors.size === 1 ? "person has" : "people have"} an active status${others === 0 ? " (yours)" : ""}. Open statuses` : "Open statuses";
  return <Link href="/statuses" aria-label={label} title={label} data-testid="link-status-shortcut"
    className="relative inline-flex h-9 items-center gap-2 rounded-full px-1 pr-3 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(188_92%_52%)]">
    <span className={cn("vm-status-ring h-7 w-7", !has && "opacity-70")} data-state={has ? "active" : "idle"} style={{ padding: 2 }}>
      <span className="grid h-full w-full place-items-center rounded-full bg-[hsl(192_49%_12%)]"><CircleDashed className="h-3.5 w-3.5" aria-hidden="true" /></span>
    </span>
    <span className="hidden sm:inline">Status</span>
    {has ? <span className="vm-status-dot rounded-full bg-[hsl(214_90%_58%)] px-1.5 font-mono text-[10px] leading-4 text-white" aria-hidden="true">{authors.size}</span> : null}
  </Link>;
}
