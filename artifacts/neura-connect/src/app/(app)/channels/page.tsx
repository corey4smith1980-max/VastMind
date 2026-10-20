"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Pin, Plus, Radio, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useListChannels, getListChannelsQueryKey, useCreateChannel, useToggleChannelFollow, type Channel,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { errMessage, relTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate, usePollInterval } from "@/lib/realtime";

// ---------- Follow toggle ----------
function FollowButton({ c }: { c: Channel }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const follow = useToggleChannelFollow({
    mutation: { onSuccess: () => invalidate("/api/channels"), onError: (e) => toast({ title: "Couldn't update", description: errMessage(e), variant: "destructive" }) },
  });
  return (
    <Button size="sm" variant={c.followed ? "secondary" : "default"} className="rounded-full" disabled={follow.isPending} onClick={() => follow.mutate({ channelId: c.id })} data-testid={`button-follow-${c.id}`}>
      {follow.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : c.followed ? <BellOff className="mr-1 h-3.5 w-3.5" /> : <Bell className="mr-1 h-3.5 w-3.5" />}
      {c.followed ? "Following" : "Follow"}
    </Button>
  );
}

function CreateChannelDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (c: Channel) => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateChannel({
    mutation: {
      onSuccess: (c) => { invalidate("/api/channels"); setName(""); setDescription(""); onOpenChange(false); onCreated(c); },
      onError: (e) => toast({ title: "Couldn't create channel", description: errMessage(e), variant: "destructive" }),
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader><DialogTitle className="font-display text-2xl">New channel</DialogTitle><DialogDescription>One-way updates: specials, notices, match results.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="ch-name">Name</Label><Input id="ch-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-testid="input-channel-name" /></div>
          <div><Label htmlFor="ch-desc">What will you post?</Label><Textarea id="ch-desc" value={description} maxLength={500} rows={3} onChange={(e) => setDescription(e.target.value)} data-testid="input-channel-description" /></div>
        </div>
        <DialogFooter>
          <Button className="rounded-full" disabled={name.trim().length < 2 || description.trim().length < 2 || create.isPending} onClick={() => create.mutate({ data: { name: name.trim(), description: description.trim() } })} data-testid="button-submit-channel">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ChannelsPage() {
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);
  const params = dq ? { q: dq } : undefined;
  const poll = usePollInterval(30_000);
  const list = useListChannels(params, { query: { queryKey: getListChannelsQueryKey(params), refetchInterval: poll } });
  return (
    <PageScroll>
      <PageHeader kicker="Broadcast" title="Channels" sub="Follow the shops, clubs and organisers you care about. Run your own to keep people in the loop."
        actions={<Button className="rounded-full" onClick={() => setCreateOpen(true)} data-testid="button-new-channel"><Plus className="mr-1 h-4 w-4" /> New channel</Button>} />
      <div className="relative mt-6">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels" className="h-11 rounded-full bg-card pl-10" aria-label="Search channels" data-testid="input-search-channels" />
      </div>
      <div className="mt-6 overflow-hidden rounded-[1.6rem] border bg-card">
        {list.isLoading ? <RowSkeleton count={4} /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
        {list.data?.length === 0 ? <EmptyState icon={Radio} title={dq ? "No channels match" : "No channels yet"} body={dq ? "Try another name." : "Create one for your shop, team or block."} /> : null}
        <ul className="divide-y">
          {list.data?.map((c, i) => {
            const show = c.pinnedUpdate ?? c.latestUpdate;
            return (
              <li key={c.id} className="rise flex items-start gap-3 p-4 hover:bg-muted/50" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} data-testid={`row-channel-${c.id}`}>
                <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => router.push(`/channels/${c.id}`)} aria-label={`Open ${c.name} channel`}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--ink))] text-accent"><Radio className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2"><span className="truncate font-semibold">{c.name}</span>{c.owner.id === me.id ? <span className="rounded-full bg-accent/40 px-1.5 text-[10px] font-bold uppercase">Yours</span> : null}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {show ? <>{c.pinnedUpdate ? <Pin className="mr-1 inline h-3 w-3 text-primary" /> : null}{show.content}</> : c.description}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{c.subscriberCount} follower{c.subscriberCount === 1 ? "" : "s"}{c.latestUpdate ? ` · ${relTime(c.latestUpdate.createdAt)}` : ""}</span>
                  </span>
                </button>
                {c.owner.id !== me.id ? <FollowButton c={c} /> : <Button size="sm" variant="outline" className="rounded-full" onClick={() => router.push(`/channels/${c.id}`)}>Manage</Button>}
              </li>
            );
          })}
        </ul>
      </div>
      <CreateChannelDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(c) => router.push(`/channels/${c.id}`)} />
    </PageScroll>
  );
}
