"use client";
import { useState } from "react";
import { Heart, HandHeart, Laugh, Loader2, MessageCircle, PartyPopper, SendHorizontal, ThumbsUp, Check } from "lucide-react";
import {
  useTogglePostReaction, useAddPostComment, useListPostComments, getListPostCommentsQueryKey, useVoteOnPoll,
  type Post, type ReactionInputReaction,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
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
      onSuccess: () => { setText(""); invalidate(`/api/posts/${postId}/comments`, "/api/feed"); },
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
    mutation: { onSuccess: () => invalidate("/api/feed"), onError: (e) => toast({ title: "Reaction failed", description: errMessage(e), variant: "destructive" }) },
  });
  const vote = useVoteOnPoll({
    mutation: { onSuccess: () => invalidate("/api/feed"), onError: (e) => toast({ title: "Vote failed", description: errMessage(e), variant: "destructive" }) },
  });
  const totalVotes = post.pollOptions.reduce((s, o) => s + o.votes, 0);
  const voted = post.pollOptions.some((o) => o.votedByMe);

  return (
    <article className="rise rounded-[1.6rem] border bg-card p-4 sm:p-5" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }} data-testid={`card-post-${post.id}`}>
      <header className="flex items-center gap-3">
        <UserAvatar id={post.author.id} name={post.author.name} src={post.author.avatarUrl} online={post.author.online} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{post.author.name} <span className="font-normal text-muted-foreground">@{post.author.username}</span></p>
          <p className="text-xs text-muted-foreground">{relTime(post.createdAt)}{post.communityName ? <> · in <span className="font-medium text-primary">{post.communityName}</span></> : null}</p>
        </div>
      </header>
      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.content}</p>

      {post.media ? (
        <div className="mt-4 overflow-hidden rounded-2xl border bg-muted">
          {post.media.contentType.startsWith("video/") ? (
            <video src={post.media.url} controls playsInline preload="metadata"
              className={cn("max-h-[560px] w-full bg-[hsl(192_52%_9%)] object-contain", post.effect === "warm" && "sepia-[.2] saturate-[1.15]", post.effect === "mono" && "grayscale", post.effect === "soft" && "brightness-[1.06] saturate-[.82]")}
              aria-label={`Video attachment from ${post.author.name}`} data-testid={`video-post-media-${post.id}`} />
          ) : post.media.contentType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.media.url} alt={post.media.name || `Photo from ${post.author.name}`} loading="lazy"
              className={cn("max-h-[560px] w-full object-contain", post.effect === "warm" && "sepia-[.2] saturate-[1.15]", post.effect === "mono" && "grayscale", post.effect === "soft" && "brightness-[1.06] saturate-[.82]")}
              data-testid={`image-post-media-${post.id}`} />
          ) : null}
          {post.audioMedia ? <audio src={post.audioMedia.url} controls preload="none" className="w-full" aria-label={`Audio from ${post.audioMedia.name}`} /> : null}
        </div>
      ) : null}

      {post.pollOptions.length ? (
        <div className="mt-4 space-y-2" role="group" aria-label="Poll">
          {post.pollOptions.map((o) => {
            const pct = totalVotes ? Math.round((o.votes / totalVotes) * 1000) / 10 : 0;
            return (
              <button key={o.id} disabled={vote.isPending} onClick={() => vote.mutate({ postId: post.id, data: { optionId: o.id } })} data-testid={`button-vote-${o.id}`}
                className={cn("relative w-full overflow-hidden rounded-xl border px-4 py-2.5 text-left text-sm transition-colors hover:border-primary", o.votedByMe && "border-primary")}>
                <span className="absolute inset-y-0 left-0 bg-accent/40 transition-[width] duration-500" style={{ width: voted ? `${pct}%` : "0%" }} aria-hidden />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">{o.votedByMe ? <Check className="h-4 w-4 text-primary" /> : null}{o.label}</span>
                  {voted ? <span className="font-mono text-xs">{pct}%</span> : null}
                </span>
              </button>
            );
          })}
          <p className="font-mono text-[11px] text-muted-foreground">{totalVotes} vote{totalVotes === 1 ? "" : "s"}{voted ? " · tap another option to change" : " · tap to vote"}</p>
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
      </footer>
      {open ? <Comments postId={post.id} /> : null}
    </article>
  );
}
