"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Bell, BellOff, Loader2, Pin, PinOff, Radio, SendHorizontal } from "lucide-react";
import {
  getListChannelUpdatesQueryKey,
  getListChannelsQueryKey,
  useListChannelUpdates,
  useListChannels,
  usePublishChannelUpdate,
  useToggleChannelFollow,
  useTogglePinnedUpdate,
  type Channel,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { errMessage, relTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";

/** Full-page channel destination. Updates and moderation controls stay in the channel route. */
export function ChannelFullPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const router = useRouter();
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [text, setText] = useState("");
  const list = useListChannels(undefined, {
    query: { queryKey: getListChannelsQueryKey(), refetchInterval: 30_000 },
  });
  const channel = list.data?.find((item) => item.id === id) ?? null;
  const owner = channel?.owner.id === me.id;
  const updates = useListChannelUpdates(id, {
    query: { enabled: !!channel, queryKey: getListChannelUpdatesQueryKey(id), refetchInterval: 30_000 },
  });

  const follow = useToggleChannelFollow({
    mutation: {
      onSuccess: () => invalidate("/api/channels"),
      onError: (e) => toast({ title: "Couldn't update", description: errMessage(e), variant: "destructive" }),
    },
  });
  const publish = usePublishChannelUpdate({
    mutation: {
      onSuccess: () => { setText(""); invalidate("/api/channels"); toast({ title: "Update published" }); },
      onError: (e) => toast({ title: "Couldn't publish", description: errMessage(e), variant: "destructive" }),
    },
  });
  const pin = useTogglePinnedUpdate({
    mutation: {
      onSuccess: () => invalidate("/api/channels"),
      onError: (e) => toast({ title: "Couldn't pin", description: errMessage(e), variant: "destructive" }),
    },
  });

  if (list.isLoading) return <PageScroll><div className="mx-auto max-w-4xl p-5"><RowSkeleton count={4} /></div></PageScroll>;
  if (list.isError) return <PageScroll><div className="mx-auto max-w-4xl p-5"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div></PageScroll>;
  if (!channel) return <PageScroll><div className="mx-auto max-w-4xl p-5">
    <Button variant="ghost" className="mb-5 rounded-full" onClick={() => router.push("/channels")}><ArrowLeft className="mr-2 h-4 w-4" />All channels</Button>
    <EmptyState icon={Radio} title="Channel not found" body="It may have been removed or you may not have access." />
  </div></PageScroll>;

  const pinned = updates.data?.find((update) => update.pinned) ?? channel.pinnedUpdate ?? null;

  return <PageScroll>
    <main className="mx-auto min-h-full w-full max-w-5xl px-4 pb-10 pt-4 sm:px-6" data-testid="page-channel-detail">
      <Button variant="ghost" className="-ml-3 mb-4 rounded-full" onClick={() => router.push("/channels")} data-testid="button-back-to-channels">
        <ArrowLeft className="mr-2 h-4 w-4" />All channels
      </Button>
      <PageHeader kicker="Broadcast channel" title={channel.name} sub={channel.description}
        actions={owner ? <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Your channel</span> :
          <Button className="rounded-full" disabled={follow.isPending} onClick={() => follow.mutate({ channelId: channel.id })} data-testid={`button-follow-${channel.id}`}>
            {follow.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : channel.followed ? <BellOff className="mr-1 h-4 w-4" /> : <Bell className="mr-1 h-4 w-4" />}
            {channel.followed ? "Following" : "Follow"}
          </Button>} />

      <section className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
        <UserAvatar id={channel.owner.id} name={channel.owner.name} src={channel.owner.avatarUrl} size="sm" />
        <p className="mr-auto text-sm text-muted-foreground">By <span className="font-medium text-foreground">{channel.owner.name}</span> · {channel.subscriberCount} follower{channel.subscriberCount === 1 ? "" : "s"}</p>
        {channel.latestUpdate ? <p className="text-xs text-muted-foreground">Updated {relTime(channel.latestUpdate.createdAt)}</p> : null}
      </section>

      {pinned ? <section className="mt-5 rounded-2xl border-l-4 border-primary bg-primary/5 p-4" aria-label="Pinned channel update">
        <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-primary"><Pin className="h-3 w-3" />Pinned update</p>
        <p className="mt-2 whitespace-pre-wrap text-sm">{pinned.content}</p>
      </section> : null}

      <section className="mt-7" aria-labelledby="channel-updates-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div><h2 id="channel-updates-heading" className="font-display text-2xl font-semibold">Channel updates</h2><p className="mt-1 text-sm text-muted-foreground">The latest posts from this channel.</p></div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{updates.data?.length ?? 0} update{updates.data?.length === 1 ? "" : "s"}</span>
        </div>
        {updates.isLoading ? <RowSkeleton count={4} /> : null}
        {updates.isError ? <ErrorState error={updates.error} onRetry={() => updates.refetch()} /> : null}
        {updates.data?.length === 0 ? <EmptyState icon={Radio} title="No updates yet" body={owner ? "Publish the first update below." : "Follow this channel to be ready for its first post."} /> : null}
        <div className="space-y-3">
          {updates.data?.map((update) => <article key={update.id} className={cn("rounded-2xl border bg-card p-4 sm:p-5", update.pinned && "border-primary/50")} data-testid={`row-update-${update.id}`}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{update.content}</p>
            <footer className="mt-3 flex items-center justify-between border-t pt-3">
              <time className="font-mono text-xs text-muted-foreground" dateTime={new Date(update.createdAt).toISOString()}>{relTime(update.createdAt)}</time>
              {owner ? <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs" disabled={pin.isPending} onClick={() => pin.mutate({ channelId: channel.id, updateId: update.id })} data-testid={`button-pin-${update.id}`}>
                {update.pinned ? <><PinOff className="mr-1 h-3.5 w-3.5" />Unpin</> : <><Pin className="mr-1 h-3.5 w-3.5" />Pin</>}
              </Button> : update.pinned ? <Pin className="h-4 w-4 text-primary" aria-label="Pinned" /> : null}
            </footer>
          </article>)}
        </div>
      </section>

      {owner ? <form className="mt-7 rounded-2xl border bg-card p-4 sm:p-5" onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) publish.mutate({ channelId: channel.id, data: { content: text.trim() } });
      }}>
        <label htmlFor="channel-update-input" className="mb-2 block text-sm font-semibold">Publish an update</label>
        <div className="flex items-end gap-2">
          <Textarea id="channel-update-input" value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} rows={3} placeholder="Share news with your followers…" className="resize-y rounded-2xl" data-testid="input-channel-update" />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={!text.trim() || publish.isPending} aria-label="Publish update" data-testid="button-publish-update">
            {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </div>
      </form> : null}
    </main>
  </PageScroll>;
}
