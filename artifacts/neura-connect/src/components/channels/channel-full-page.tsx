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

  return <PageScroll className="!max-w-none !px-0 !py-0">
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-col bg-background" data-testid="page-channel-detail">
      <header className="sticky top-0 z-20 border-b bg-background/95 px-3 py-2.5 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={() => router.push("/channels")} aria-label="All channels" data-testid="button-back-to-channels">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[hsl(var(--ink))] text-accent"><Radio className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-semibold">{channel.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{channel.subscriberCount} follower{channel.subscriberCount === 1 ? "" : "s"} · {channel.owner.name}</p>
          </div>
          {owner ? <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Your channel</span> :
            <Button size="sm" className="rounded-full" disabled={follow.isPending} onClick={() => follow.mutate({ channelId: channel.id })} data-testid={`button-follow-${channel.id}`}>
              {follow.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : channel.followed ? <BellOff className="mr-1 h-4 w-4" /> : <Bell className="mr-1 h-4 w-4" />}
              {channel.followed ? "Following" : "Follow"}
            </Button>}
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 pb-5 pt-4 sm:px-6">
        <p className="mb-5 text-sm text-muted-foreground">{channel.description}</p>
        {pinned ? <section className="mb-5 rounded-xl border border-primary/25 bg-primary/5 p-3.5" aria-label="Pinned channel update">
          <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-primary"><Pin className="h-3 w-3" />Pinned update</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm">{pinned.content}</p>
        </section> : null}

        <section aria-labelledby="channel-updates-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="channel-updates-heading" className="font-display text-lg font-semibold">Channel updates</h2>
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{updates.data?.length ?? 0}</span>
          </div>
          {updates.isLoading ? <RowSkeleton count={4} /> : null}
          {updates.isError ? <ErrorState error={updates.error} onRetry={() => updates.refetch()} /> : null}
          {updates.data?.length === 0 ? <EmptyState icon={Radio} title="No updates yet" body={owner ? "Publish the first update below." : "Follow this channel to be ready for its first post."} /> : null}
          <div className="space-y-3">
            {updates.data?.map((update) => <div key={update.id} className="flex items-end gap-2.5" data-testid={`row-update-${update.id}`}>
              <UserAvatar id={channel.owner.id} name={channel.owner.name} src={channel.owner.avatarUrl} size="sm" />
              <article className={cn("max-w-[min(88%,44rem)] rounded-2xl rounded-bl-md border bg-card px-4 py-3 shadow-sm", update.pinned && "border-primary/50")}>
                <header className="mb-1 flex items-center gap-2">
                  <span className="truncate text-xs font-semibold">{channel.name}</span>
                  {update.pinned ? <Pin className="h-3 w-3 shrink-0 text-primary" aria-label="Pinned" /> : null}
                  <time className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground" dateTime={new Date(update.createdAt).toISOString()}>{relTime(update.createdAt)}</time>
                </header>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{update.content}</p>
                {owner ? <footer className="mt-2 flex justify-end border-t pt-1.5">
                  <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-[11px]" disabled={pin.isPending} onClick={() => pin.mutate({ channelId: channel.id, updateId: update.id })} data-testid={`button-pin-${update.id}`}>
                    {update.pinned ? <><PinOff className="mr-1 h-3 w-3" />Unpin</> : <><Pin className="mr-1 h-3 w-3" />Pin</>}
                  </Button>
                </footer> : null}
              </article>
            </div>)}
          </div>
        </section>
      </div>

      {owner ? <form className="sticky bottom-0 z-10 border-t bg-background/95 px-3 py-3 backdrop-blur sm:px-5" onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) publish.mutate({ channelId: channel.id, data: { content: text.trim() } });
      }}>
        <div className="mx-auto flex max-w-4xl items-end gap-2">
          <label htmlFor="channel-update-input" className="sr-only">Publish an update</label>
          <Textarea id="channel-update-input" value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} rows={2} placeholder="Share an update with followers…" className="max-h-32 min-h-11 resize-y rounded-2xl bg-card" data-testid="input-channel-update" />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={!text.trim() || publish.isPending} aria-label="Publish update" data-testid="button-publish-update">
            {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </div>
      </form> : null}
    </main>
  </PageScroll>;
}
