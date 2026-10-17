"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, MessageCircle, Music2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetVideosQueryKey, getListPostCommentsQueryKey, useAddPostComment, useListPostComments, useTogglePostReaction, useToggleUserFollow, type Post } from "@workspace/api-client-react";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { errMessage, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const effectClass = { none: "", warm: "sepia-[.2] saturate-[1.15]", mono: "grayscale", soft: "brightness-[1.06] saturate-[.82]" };

function CommentsPanel({ post, onClose }: { post: Post; onClose: () => void }) {
  const [text, setText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const list = useListPostComments(post.id, { query: { queryKey: getListPostCommentsQueryKey(post.id) } });
  const add = useAddPostComment({
    mutation: {
      onSuccess: (comment) => {
        setText("");
        queryClient.setQueryData(getListPostCommentsQueryKey(post.id), (old: typeof list.data) => old ? [...old, comment] : [comment]);
        queryClient.setQueriesData({ queryKey: getGetVideosQueryKey() }, (old: unknown) => patchPage(old, post.id, { commentsCount: post.commentsCount + 1 }));
      },
      onError: (e) => toast({ title: "Couldn't add comment", description: errMessage(e), variant: "destructive" }),
    },
  });
  return <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[370px] flex-col border-l border-white/10 bg-[hsl(192_46%_10%/.96)] text-white backdrop-blur-xl" aria-label={`Comments on ${post.author.name}'s clip`}>
    <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
      <div><p className="font-display text-xl">The conversation</p><p className="text-xs text-white/55">{post.commentsCount} comments</p></div>
      <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/10" aria-label="Close comments">Close</Button>
    </header>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {list.isLoading ? <div className="space-y-3" aria-label="Loading comments"><div className="h-12 animate-pulse rounded-xl bg-white/10" /><div className="h-12 animate-pulse rounded-xl bg-white/10" /></div> : null}
      {list.isError ? <div role="alert" className="rounded-xl bg-white/5 p-4 text-sm text-white/75">Couldn't load the thread. <button className="underline" onClick={() => list.refetch()}>Try again</button></div> : null}
      {list.data?.length === 0 ? <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/65">Nothing here yet. Leave the first thoughtful note.</p> : null}
      {list.data?.map((comment) => <div key={comment.id} className="flex gap-2.5" data-testid={`video-comment-${comment.id}`}>
        <UserAvatar id={comment.author.id} name={comment.author.name} src={comment.author.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1 rounded-2xl bg-white/[.08] px-3 py-2.5"><p className="text-xs font-semibold">{comment.author.name} <span className="font-normal text-white/45">· {relTime(comment.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">{comment.content}</p></div>
      </div>)}
    </div>
    <form className="flex gap-2 border-t border-white/10 p-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate({ postId: post.id, data: { content: text.trim() } }); }}>
      <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Add to the conversation" className="rounded-full border-white/15 bg-white/10 text-white placeholder:text-white/45" aria-label="Write a comment" data-testid={`input-video-comment-${post.id}`} />
      <Button type="submit" disabled={!text.trim() || add.isPending} className="rounded-full" data-testid="button-send-video-comment">Send</Button>
    </form>
  </aside>;
}

export function ReelCard({ post, active, onActive, index }: { post: Post; active: boolean; onActive: () => void; index: number }) {
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [following, setFollowing] = useState(post.author.following);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const videoKey = getGetVideosQueryKey();
  const react = useTogglePostReaction({ mutation: { onSuccess: (result) => queryClient.setQueriesData({ queryKey: videoKey }, (old: unknown) => patchPage(old, post.id, { reacted: result.reacted, reactionsCount: result.reactionsCount })), onError: (e) => toast({ title: "Reaction failed", description: errMessage(e), variant: "destructive" }) } });
  const follow = useToggleUserFollow({
    mutation: {
      onSuccess: (result) => {
        setFollowing(result.following);
        queryClient.setQueriesData({ queryKey: videoKey }, (old: unknown) => patchCreator(old, post.author.id, result.following));
        void queryClient.invalidateQueries({ queryKey: videoKey });
      },
      onError: (e) => { setFollowing(post.author.following); toast({ title: "Follow didn't save", description: errMessage(e), variant: "destructive" }); },
    },
  });
  const video = post.media;
  useEffect(() => {
    const element = document.querySelector<HTMLVideoElement>(`[data-reel-video="${post.id}"]`);
    if (!element) return;
    if (active) {
      void element.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      element.pause();
      const audio = document.querySelector<HTMLAudioElement>(`[data-reel-audio="${post.id}"]`);
      audio?.pause();
      setPlaying(false);
    }
  }, [active, post.id]);
  if (!video) return null;
  const togglePlay = (element: HTMLVideoElement) => {
    const audio = document.querySelector<HTMLAudioElement>(`[data-reel-audio="${post.id}"]`);
    if (element.paused) {
      void element.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      if (!muted && audio) void audio.play().catch(() => {});
    } else { element.pause(); audio?.pause(); setPlaying(false); }
  };
  const toggleSound = () => {
    const element = document.querySelector<HTMLVideoElement>(`[data-reel-video="${post.id}"]`);
    if (!element) return;
    const next = !muted;
    setMuted(next);
    element.muted = next;
    const audio = document.querySelector<HTMLAudioElement>(`[data-reel-audio="${post.id}"]`);
    if (audio) { audio.muted = next; if (!next && active) void audio.play().catch(() => {}); if (next) audio.pause(); }
  };
  return <article className="relative flex h-full min-h-0 snap-start items-center justify-center overflow-hidden bg-[hsl(192_52%_9%)]" data-testid={`reel-${post.id}`} onMouseEnter={onActive}>
    <video data-reel-video={post.id} src={video.url} poster={undefined} muted={muted} playsInline loop preload={active ? "auto" : "metadata"} className={cn("absolute inset-0 h-full w-full object-contain", effectClass[post.effect])} aria-label={`Video by ${post.author.name}`} onClick={(e) => togglePlay(e.currentTarget)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    {post.audioMedia ? <audio data-reel-audio={post.id} src={post.audioMedia.url} muted={muted} loop preload={active ? "auto" : "none"} /> : null}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(192_55%_5%/.94)] via-transparent to-[hsl(192_55%_5%/.13)]" />
    <button className="absolute inset-0 z-[1] cursor-pointer" onClick={() => { const element = document.querySelector<HTMLVideoElement>(`[data-reel-video="${post.id}"]`); if (element) togglePlay(element); }} aria-label={playing ? "Pause video" : "Play video"} data-testid={`button-play-${post.id}`} />
    {!playing && active ? <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[2] grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur"><Play className="ml-1 h-6 w-6 fill-current" /></span> : null}
    <div className="absolute bottom-0 left-0 right-16 z-[3] p-5 pb-7 text-white sm:left-5 sm:max-w-[min(78%,540px)] sm:p-7">
      <div className="flex items-center gap-2.5">
        <UserAvatar id={post.author.id} name={post.author.name} src={post.author.avatarUrl} size="md" />
        <Link href={`/profile/${encodeURIComponent(post.author.username)}`} className="min-w-0 text-shadow" data-testid={`link-video-creator-${post.id}`}>
          <span className="block truncate text-sm font-bold">{post.author.name}</span><span className="block text-xs text-white/70">@{post.author.username}</span>
        </Link>
        {!following ? <Button size="sm" variant="outline" className="h-8 rounded-full border-white/50 bg-white/10 text-white hover:bg-white/20" onClick={() => { setFollowing(true); follow.mutate({ userId: post.author.id }); }} disabled={follow.isPending} data-testid={`button-follow-${post.author.id}`}>Follow</Button> : <span className="rounded-full border border-white/25 px-3 py-1 text-[11px] text-white/70">Following</span>}
      </div>
      <p className="mt-4 line-clamp-4 max-w-xl whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed text-white [text-shadow:0_1px_8px_rgba(0,0,0,.7)]" data-testid={`text-video-caption-${post.id}`}>{post.content}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-white/80">
        <span className="rounded-full border border-white/30 bg-black/20 px-2.5 py-1">{post.effect === "none" ? "Original look" : `${post.effect} look`}</span>
        {post.communityName ? <span className="rounded-full border border-white/30 bg-black/20 px-2.5 py-1">{post.communityName}</span> : null}
        {post.audioMedia ? <span className="inline-flex max-w-[210px] items-center gap-1 rounded-full border border-white/30 bg-black/20 px-2.5 py-1"><Music2 className="h-3 w-3 shrink-0" /><span className="truncate">In-app sound · {post.audioMedia.name}</span></span> : <span className="rounded-full border border-white/30 bg-black/20 px-2.5 py-1">Original sound</span>}
      </div>
    </div>
    <div className="absolute bottom-7 right-3 z-[4] flex flex-col items-center gap-4 text-white sm:right-5">
      <button onClick={() => { const el = document.querySelector<HTMLVideoElement>(`[data-reel-video="${post.id}"]`); if (el) togglePlay(el); }} className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur" aria-label={playing ? "Pause clip" : "Play clip"}><span className="sr-only">{playing ? "Pause" : "Play"}</span>{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
      <button onClick={toggleSound} className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur" aria-label={muted ? "Turn sound on" : "Mute sound"} data-testid={`button-sound-${post.id}`}>{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
      <button onClick={() => react.mutate({ postId: post.id, data: { reaction: "like" } })} disabled={react.isPending} className="flex flex-col items-center gap-1" aria-label={post.reacted ? "Unlike clip" : "Like clip"} data-testid={`button-like-${post.id}`}><span className={cn("grid h-12 w-12 place-items-center rounded-full bg-black/35 backdrop-blur", post.reacted && "text-primary")}><Heart className={cn("h-6 w-6", post.reacted && "fill-current")} /></span><span className="text-xs font-semibold">{post.reactionsCount}</span></button>
      <button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1" aria-label={`View ${post.commentsCount} comments`} data-testid={`button-open-comments-${post.id}`}><span className="grid h-12 w-12 place-items-center rounded-full bg-black/35 backdrop-blur"><MessageCircle className="h-6 w-6" /></span><span className="text-xs font-semibold">{post.commentsCount}</span></button>
      <span className="font-mono text-[10px] text-white/65">{index + 1}</span>
    </div>
    {commentsOpen ? <CommentsPanel post={post} onClose={() => setCommentsOpen(false)} /> : null}
  </article>;
}

function patchPage(old: unknown, postId: string, patch: Partial<Post>): unknown {
  if (!old || typeof old !== "object" || !("items" in old)) return old;
  const page = old as { items: Post[]; nextBefore: string | null };
  return { ...page, items: page.items.map((item) => item.id === postId ? { ...item, ...patch } : item) };
}

function patchCreator(old: unknown, userId: string, following: boolean): unknown {
  if (!old || typeof old !== "object" || !("items" in old)) return old;
  const page = old as { items: Post[]; nextBefore: string | null };
  return { ...page, items: page.items.map((item) => item.author.id === userId ? { ...item, author: { ...item.author, following } } : item) };
}
