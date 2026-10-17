"use client";
import { useMemo, useState } from "react";
import { CircleDashed, Hourglass, Loader2 } from "lucide-react";
import { useListStatuses, getListStatusesQueryKey, useCreateStatus, type Status } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { errMessage, relTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate, usePollInterval } from "@/lib/realtime";

function hoursLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expiring";
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h left` : `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}
function lifePct(s: Status) {
  const total = new Date(s.expiresAt).getTime() - new Date(s.createdAt).getTime();
  return Math.max(0, Math.min(1, (new Date(s.expiresAt).getTime() - Date.now()) / total));
}

// ---------- 24h text statuses grouped by person ----------
export default function StatusesPage() {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [text, setText] = useState("");
  const [viewing, setViewing] = useState<Status[] | null>(null);
  const poll = usePollInterval(60_000);
  const list = useListStatuses({ query: { queryKey: getListStatusesQueryKey(), refetchInterval: poll } });
  const create = useCreateStatus({
    mutation: {
      onSuccess: () => { setText(""); invalidate("/api/statuses"); toast({ title: "Status is up for 24 hours" }); },
      onError: (e) => toast({ title: "Couldn't post status", description: errMessage(e), variant: "destructive" }),
    },
  });

  const groups = useMemo(() => {
    const m = new Map<string, Status[]>();
    for (const s of list.data ?? []) m.set(s.author.id, [...(m.get(s.author.id) ?? []), s]);
    return Array.from(m.values()).sort((a, b) => (a[0].author.id === me.id ? -1 : b[0].author.id === me.id ? 1 : 0));
  }, [list.data, me.id]);

  return (
    <PageScroll>
      <PageHeader kicker="Today only" title="Status" sub="A line about your day. Text only, gone in 24 hours." />
      <div className="rise mt-6 rounded-[1.6rem] bg-[hsl(var(--ink))] p-5 text-[#f4ece0]">
        <div className="flex gap-3">
          <UserAvatar id={me.id} name={me.name} src={me.avatarUrl} />
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={2} placeholder="Open till 6 today · Back from holiday · Anyone up for a walk?"
            className="resize-none border-0 bg-transparent p-0 text-lg text-[#f4ece0] shadow-none placeholder:text-[#f4ece0]/50 focus-visible:ring-0" aria-label="Status text" data-testid="input-status" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[11px] text-[#f4ece0]/60">{text.length}/500 · photo statuses coming soon</span>
          <Button className="rounded-full" disabled={!text.trim() || create.isPending} onClick={() => create.mutate({ data: { content: text.trim() } })} data-testid="button-post-status">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Share for 24h
          </Button>
        </div>
      </div>

      <div className="mt-8">
        {list.isLoading ? <CardSkeleton count={2} /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
        {list.data?.length === 0 ? <EmptyState icon={CircleDashed} title="No statuses right now" body="When friends share what they're up to, it shows here for a day." /> : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((g, i) => {
            const latest = g[g.length - 1];
            const pct = lifePct(latest);
            return (
              <li key={latest.author.id} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
                <button onClick={() => setViewing(g)} className="flex w-full items-center gap-4 rounded-[1.4rem] border bg-card p-4 text-left hover:border-primary" data-testid={`button-status-${latest.author.id}`}>
                  <span className="relative">
                    <svg viewBox="0 0 60 60" className="absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)] -rotate-90" aria-hidden>
                      <circle cx="30" cy="30" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                      <circle cx="30" cy="30" r="28" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 176} 176`} />
                    </svg>
                    <UserAvatar id={latest.author.id} name={latest.author.name} src={latest.author.avatarUrl} size="lg" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{latest.author.id === me.id ? "You" : latest.author.name}{g.length > 1 ? <span className="ml-1 font-mono text-xs text-muted-foreground">×{g.length}</span> : null}</span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">{latest.content}</span>
                    <span className="mt-1 flex items-center gap-1 font-mono text-[11px] text-muted-foreground"><Hourglass className="h-3 w-3" />{hoursLeft(latest.expiresAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md overflow-hidden rounded-[2rem] border-0 bg-[hsl(var(--ink))] p-0 text-[#f4ece0]">
          {viewing ? (
            <>
              <DialogHeader className="flex-row items-center gap-3 space-y-0 p-5">
                <UserAvatar id={viewing[0].author.id} name={viewing[0].author.name} src={viewing[0].author.avatarUrl} size="sm" />
                <div className="text-left"><DialogTitle className="text-base">{viewing[0].author.name}</DialogTitle><DialogDescription className="text-[#f4ece0]/60">{viewing.length} update{viewing.length === 1 ? "" : "s"} today</DialogDescription></div>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 pb-6">
                {viewing.map((s) => (
                  <div key={s.id} className="rounded-2xl bg-white/5 p-5">
                    <p className="font-display text-2xl font-semibold leading-snug">{s.content}</p>
                    <p className="mt-3 font-mono text-[11px] text-[#f4ece0]/60">{relTime(s.createdAt)} · {hoursLeft(s.expiresAt)}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageScroll>
  );
}
