"use client";
import { useState } from "react";
import { EyeOff, Heart, HandHeart, Laugh, Loader2, MessageCircle, PartyPopper, Share2, SendHorizontal, ThumbsUp, Check } from "lucide-react";
import {
  communityTopicLabel, useTogglePostReaction, useAddPostComment, useListPostComments, getListPostCommentsQueryKey, useVoteOnPoll,
  type Post, type ReactionInputReaction,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { ShoppableProducts } from "@/components/commerce/shoppable";
import { useToast } from "@/hooks/use-toast";
import { errMessage, relTime } from "@/lib/format";
import { useInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";

const REACTIONS: { key: ReactionInputReaction; icon: typeof Heart; label: string }[] = [
  { key: "like", icon: ThumbsUp, label: "Like" },
  { key: "love", icon: Heart, label: "Love" },
  { key: "celebrate", icon: PartyPopper, label: "Celebrate" },
  { key: "support", icon: HandHeart, label: "Support" },
  { key: "laugh", icon: Laugh, label: "Haha" },
];

// ---------- Persistent comment thread ----------
function Comments({ postId }: { postId: string }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [text, setText] = useState("");
  const list = useListPostComments(postId, { query: { queryKey: getListPostCommentsQueryKey(postId) } });
  const add = useAddPostComment({
    mutation: {
      onSuccess: () => { setText(""); invalidate(`/api/posts/${postId}/comments`, "/api/feed", "/api/videos"); },
      onError: (e) => toast({ title: "Comment failed", description: errMessage(e), variant: "destructive" }),
    },
  });
  return (
    <div className="rise mt-3 space-y-3 border-t pt-3">
      {list.isLoading ? <Skeleton className="h-10" /> : null}
      {list.isError ? <p className="text-sm text-destructive">Couldn't load comments. <button className="underline" onClick={() => list.refetch()}>Retry</button></p> : null}
      {list.data?.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet — start the thread.</p> : null}
      {list.data?.map((c) => (
        <div key={c.id} className="flex gap-2.5" data-testid={`comment-${c.id}`}>
          <UserAvatar id={c.author.id} name={c.author.name} src={c.author.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1 rounded-2xl bg-muted px-3 py-2">
            <p className="text-xs"><span className="font-semibold">{c.author.name}</span> <span className="text-muted-foreground">· {relTime(c.createdAt)}</span></p>
            <p className="whitespace-pre-wrap break-words text-sm">{c.content}</p>
          </div>
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate({ postId, data: { content: text.trim() } }); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Write a comment" className="rounded-full" aria-label="Comment" data-testid={`input-comment-${postId}`} />
        <Button type="submit" size="icon" className="rounded-full" disabled={!text.trim() || add.isPending} aria-label="Post comment">
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

// ---------- Post card ----------
export function PostCard({ post, index = 0 }: { post: Post; index?: number }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const react = useTogglePostReaction({
    mutation: { onSuccess: () => invalidate("/api/feed", "/api/videos"), onError: (e) => toast({ title: "Reaction failed", description: errMessage(e), variant: "destructive" }) },
  });
  const vote = useVoteOnPoll({
    mutation: { onSuccess: () => invalidate("/api/feed", "/api/videos"), onError: (e) => toast({ title: "Vote failed", description: errMessage(e), variant: "destructive" }) },
  });
  const totalVotes = post.pollOptions.reduce((s, o) => s + o.votes, 0);
  const voted = post.pollOptions.some((o) => o.votedByMe);

  return (
    <article className="rise rounded-[1.6rem] border bg-card p-4 sm:p-5" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }} data-testid={`card-post-${post.id}`}>
      <header className="flex items-center gap-3">
        {post.isAnonymous ? <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><EyeOff className="h-4 w-4" /></span>
          : <UserAvatar id={post.author.id} name={post.author.name} src={post.author.avatarUrl} online={post.author.online} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{post.isAnonymous ? "Anonymous member" : <>{post.author.name} <span className="font-normal text-muted-foreground">@{post.author.username}</span></>}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{post.isAnonymous ? "Posted anonymously · " : ""}{relTime(post.createdAt)}</span>
            {post.communityTopic ? <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{communityTopicLabel(post.communityTopic)}</span> : null}
          </div>
        </div>
      </header>
      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.content}</p>

      {post.media ? (
        <div className="mt-4 overflow-hidden rounded-2xl border bg-muted">
          {post.media.contentType.startsWith("video/") ? (
            <video src={post.media.url} controls playsInline preload="metadata"
              className={cn("max-h-[560px] w-full bg-[hsl(192_52%_9%)] object-contain", post.effect === "warm" && "sepia-[.2] saturate-[1.15]", post.effect === "mono" && "grayscale", post.effect === "soft" && "brightness-[1.06] saturate-[.82]")}
              aria-label={`Video attachment from ${post.isAnonymous ? "anonymous member" : post.author.name}`} data-testid={`video-post-media-${post.id}`} />
          ) : post.media.contentType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.media.url} alt={post.media.name || `Photo from ${post.isAnonymous ? "anonymous member" : post.author.name}`} loading="lazy"
              className={cn("max-h-[560px] w-full object-contain", post.effect === "warm" && "sepia-[.2] saturate-[1.15]", post.effect === "mono" && "grayscale", post.effect === "soft" && "brightness-[1.06] saturate-[.82]")}
              data-testid={`image-post-media-${post.id}`} />
          ) : null}
          {post.audioMedia ? <audio src={post.audioMedia.url} controls preload="none" className="w-full" aria-label={`Audio from ${post.audioMedia.name}`} /> : null}
        </div>
      ) : null}

      {!post.isAnonymous ? <ShoppableProducts post={post} className="mt-3" /> : null}

      {post.pollOptions.length ? (
        <div className="mt-4 space-y-2.5" role="group" aria-label={`Poll results · ${totalVotes} votes`}>
          {post.pollOptions.map((o) => {
            const pct = totalVotes ? Math.round((o.votes / totalVotes) * 100) : 0;
            return (
              <button key={o.id} disabled={vote.isPending} onClick={() => vote.mutate({ postId: post.id, data: { optionId: o.id } })} data-testid={`button-vote-${o.id}`} aria-pressed={o.votedByMe} aria-label={`${o.label}: ${o.votes} votes, ${pct}%`}
                className={cn("w-full rounded-xl border px-3.5 py-3 text-left transition-colors hover:border-primary disabled:cursor-wait", o.votedByMe ? "border-primary bg-primary/[.04]" : "border-border bg-background/40")}>
                <span className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium">{o.votedByMe ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}<span className="truncate">{o.label}</span></span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{o.votes} · {pct}%</span>
                </span>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-muted/80" aria-hidden="true">
                  <span className={cn("block h-full rounded-full bg-gradient-to-r from-primary via-[hsl(214_90%_58%)] to-[hsl(272_82%_66%)] transition-[width] duration-700 ease-out", o.votes > 0 && "min-w-[3px]")} style={{ width: `${pct}%` }} />
                </span>
              </button>
            );
          })}
          <p className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-muted-foreground"><span>{voted ? "Your vote is in · tap a different option to change it" : "Tap an option to vote"}</span><span className="font-mono tabular-nums">{totalVotes} vote{totalVotes === 1 ? "" : "s"}</span></p>
        </div>
      ) : null}

      <footer className="mt-4 flex items-center gap-1">
        <Popover open={pickOpen} onOpenChange={setPickOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("rounded-full", post.reacted && "text-primary")} aria-label="React" data-testid={`button-react-${post.id}`}>
              <Heart className={cn("mr-1 h-4 w-4", post.reacted && "fill-current")} /> {post.reactionsCount}
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="flex w-auto gap-1 rounded-full p-1.5">
            {REACTIONS.map((r) => (
              <button key={r.key} aria-label={r.label} title={r.label} onClick={() => { react.mutate({ postId: post.id, data: { reaction: r.key } }); setPickOpen(false); }}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-110 hover:bg-muted" data-testid={`button-reaction-${r.key}-${post.id}`}>
                <r.icon className="h-5 w-5 text-primary" />
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={`button-comments-${post.id}`}>
          <MessageCircle className="mr-1 h-4 w-4" /> {post.commentsCount}
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto rounded-full" aria-label="Share post" data-testid={`button-share-${post.id}`} onClick={async () => {
          const url = `${window.location.origin}/videos?q=${encodeURIComponent(post.content.slice(0, 40))}`;
          try { if (navigator.share) await navigator.share({ text: post.content.slice(0, 140), url }); else { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); } } catch { /* share dismissed */ }
        }}><Share2 className="h-4 w-4" /></Button>
      </footer>
      {open ? <Comments postId={post.id} /> : null}
    </article>
  );
}
