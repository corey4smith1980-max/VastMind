"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Pin, PinOff, Plus, Radio, Search, SendHorizontal } from "lucide-react";
import {
  useListChannels, getListChannelsQueryKey, useCreateChannel, useToggleChannelFollow, usePublishChannelUpdate,
  useTogglePinnedUpdate, useListChannelUpdates, getListChannelUpdatesQueryKey, type Channel,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { errMessage, relTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate, usePollInterval } from "@/lib/realtime";
import { cn } from "@/lib/utils";

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

// ---------- Channel detail: full history, publish, pin ----------
function ChannelSheet({ channel, onClose }: { channel: Channel | null; onClose: () => void }) {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [text, setText] = useState("");
  const id = channel?.id ?? "";
  const owner = channel?.owner.id === me.id;
  const updates = useListChannelUpdates(id, { query: { enabled: !!channel, queryKey: getListChannelUpdatesQueryKey(id), refetchInterval: 30_000 } });
  const publish = usePublishChannelUpdate({
    mutation: {
      onSuccess: () => { setText(""); invalidate("/api/channels"); toast({ title: "Update published" }); },
      onError: (e) => toast({ title: "Couldn't publish", description: errMessage(e), variant: "destructive" }),
    },
  });
  const pin = useTogglePinnedUpdate({
    mutation: { onSuccess: () => invalidate("/api/channels"), onError: (e) => toast({ title: "Couldn't pin", description: errMessage(e), variant: "destructive" }) },
  });
  const pinned = updates.data?.find((u) => u.pinned) ?? channel?.pinnedUpdate ?? null;

  return (
    <Sheet open={!!channel} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        {channel ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-display text-2xl">{channel.name}</SheetTitle>
              <SheetDescription>{channel.description}</SheetDescription>
              <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                <UserAvatar id={channel.owner.id} name={channel.owner.name} src={channel.owner.avatarUrl} size="sm" />
                <span className="mr-auto">by {channel.owner.name} · {channel.subscriberCount} follower{channel.subscriberCount === 1 ? "" : "s"}</span>
                {!owner ? <FollowButton c={channel} /> : null}
              </div>
            </SheetHeader>
            {pinned ? (
              <div className="mt-4 rounded-2xl border-l-4 border-primary bg-primary/5 p-3">
                <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-primary"><Pin className="h-3 w-3" /> Pinned</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{pinned.content}</p>
              </div>
            ) : null}
            <div className="mt-4 flex-1 space-y-3 overflow-y-auto scrollbar-thin">
              {updates.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />) : null}
              {updates.isError ? <ErrorState error={updates.error} onRetry={() => updates.refetch()} /> : null}
              {updates.data?.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{owner ? "Publish your first update below." : "No updates yet."}</p> : null}
              {updates.data?.map((u) => (
                <div key={u.id} className={cn("rounded-2xl border bg-card p-3", u.pinned && "border-primary/50")} data-testid={`row-update-${u.id}`}>
                  <p className="whitespace-pre-wrap text-sm">{u.content}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-muted-foreground">{relTime(u.createdAt)}</span>
                    {owner ? (
                      <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" disabled={pin.isPending} onClick={() => pin.mutate({ channelId: channel.id, updateId: u.id })} data-testid={`button-pin-${u.id}`}>
                        {u.pinned ? <><PinOff className="mr-1 h-3 w-3" /> Unpin</> : <><Pin className="mr-1 h-3 w-3" /> Pin</>}
                      </Button>
                    ) : u.pinned ? <Pin className="h-3.5 w-3.5 text-primary" aria-label="Pinned" /> : null}
                  </div>
                </div>
              ))}
            </div>
            {owner ? (
              <form className="mt-3 flex items-end gap-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) publish.mutate({ channelId: channel.id, data: { content: text.trim() } }); }}>
                <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={2} placeholder="Broadcast an update to your followers" className="resize-none rounded-2xl" aria-label="Update" data-testid="input-channel-update" />
                <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={!text.trim() || publish.isPending} aria-label="Publish" data-testid="button-publish-update">
                  {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                </Button>
              </form>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
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
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);
  const params = dq ? { q: dq } : undefined;
  const poll = usePollInterval(30_000);
  const list = useListChannels(params, { query: { queryKey: getListChannelsQueryKey(params), refetchInterval: poll } });
  const open = list.data?.find((c) => c.id === openId) ?? null;

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
                <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => setOpenId(c.id)}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--ink))] text-accent"><Radio className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2"><span className="truncate font-semibold">{c.name}</span>{c.owner.id === me.id ? <span className="rounded-full bg-accent/40 px-1.5 text-[10px] font-bold uppercase">Yours</span> : null}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {show ? <>{c.pinnedUpdate ? <Pin className="mr-1 inline h-3 w-3 text-primary" /> : null}{show.content}</> : c.description}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{c.subscriberCount} follower{c.subscriberCount === 1 ? "" : "s"}{c.latestUpdate ? ` · ${relTime(c.latestUpdate.createdAt)}` : ""}</span>
                  </span>
                </button>
                {c.owner.id !== me.id ? <FollowButton c={c} /> : <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpenId(c.id)}>Manage</Button>}
              </li>
            );
          })}
        </ul>
      </div>
      <ChannelSheet channel={open} onClose={() => setOpenId(null)} />
      <CreateChannelDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(c) => setOpenId(c.id)} />
    </PageScroll>
  );
}
