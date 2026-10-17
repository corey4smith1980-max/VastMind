"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, Heart, MessageCircle, Music2, Pause, Play, Share2, Volume2, VolumeX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCreatorQueryKey, getListPostCommentsQueryKey, useAddPostComment, useListPostComments, useTogglePostReaction, useToggleUserFollow, type Post } from "@workspace/api-client-react";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { basePath } from "@/lib/base";
import { errMessage, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { activeCue, useCaptionsPref, useVideoPlayback, useWatchSession } from "./video-kit";

const effectClass = { none: "", warm: "sepia-[.2] saturate-[1.15]", mono: "grayscale", soft: "brightness-[1.06] saturate-[.82]" };

function CommentsPanel({ post, count, onAdded, onClose }: { post: Post; count: number; onAdded: () => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const list = useListPostComments(post.id, { query: { queryKey: getListPostCommentsQueryKey(post.id) } });
  const add = useAddPostComment({
    mutation: {
      onSuccess: (comment) => {
        setText("");
        queryClient.setQueryData(getListPostCommentsQueryKey(post.id), (old: typeof list.data) => old ? [...old, comment] : [comment]);
        onAdded();
      },
      onError: (e) => toast({ title: "Couldn't add comment", description: errMessage(e), variant: "destructive" }),
    },
  });
  return <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[370px] flex-col border-l border-white/10 bg-[hsl(192_46%_10%/.96)] text-white backdrop-blur-xl" aria-label={`Comments on ${post.author.name}'s clip`}>
    <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
      <div><p className="font-display text-xl">The conversation</p><p className="text-xs text-white/55">{count} comments</p></div>
      <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/10" aria-label="Close comments">Close</Button>
    </header>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {list.isLoading ? <div className="space-y-3" aria-label="Loading comments"><div className="h-12 animate-pulse rounded-xl bg-white/10" /><div className="h-12 animate-pulse rounded-xl bg-white/10" /></div> : null}
      {list.isError ? <div role="alert" className="rounded-xl bg-white/5 p-4 text-sm text-white/75">Couldn't load the thread. <button className="underline" onClick={() => list.refetch()}>Try again</button></div> : null}
      {list.data?.length === 0 ? <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/65">Nothing here yet. Leave the first thoughtful note.</p> : null}
      {list.data?.map((comment) => <div key={comment.id} className="flex gap-2.5" data-testid={`video-comment-${comment.id}`}>
        <UserAvatar id={comment.author.id} name={comment.author.name} src={comment.author.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1 rounded-2xl bg-white/[.08] px-3 py-2.5"><p className="text-xs font-semibold"><Link href={`/profile/${encodeURIComponent(comment.author.id)}`} className="hover:underline">{comment.author.name}</Link> <span className="font-normal text-white/45">· {relTime(comment.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">{comment.content}</p></div>
      </div>)}
    </div>
    <form className="flex gap-2 border-t border-white/10 p-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate({ postId: post.id, data: { content: text.trim() } }); }}>
      <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Add to the conversation" className="rounded-full border-white/15 bg-white/10 text-white placeholder:text-white/45" aria-label="Write a comment" data-testid={`input-video-comment-${post.id}`} />
      <Button type="submit" disabled={!text.trim() || add.isPending} className="rounded-full" data-testid="button-send-video-comment">Send</Button>
    </form>
  </aside>;
}

export function ReelCard({ post, active, onActive, index }: { post: Post; active: boolean; onActive: () => void; index: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastTime = useRef(0);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [following, setFollowing] = useState(post.author.following);
  const [stats, setStats] = useState({ reacted: post.reacted, reactions: post.reactionsCount, comments: post.commentsCount });
  const [ccOn, toggleCc] = useCaptionsPref();
  const session = useWatchSession(post.id, active);
  const playback = useVideoPlayback(post.media, active);
  const soundtrack = useVideoPlayback(post.audioMedia, active && playing && !muted);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasCaptions = !!post.captions?.length;
  const cue = hasCaptions && ccOn ? activeCue(post.captions, time) : null;

  const react = useTogglePostReaction({ mutation: { onSuccess: (result) => setStats((s) => ({ ...s, reacted: result.reacted, reactions: result.reactionsCount })), onError: (e) => toast({ title: "Reaction failed", description: errMessage(e), variant: "destructive" }) } });
  const follow = useToggleUserFollow({
    mutation: {
      onSuccess: (result) => { setFollowing(result.following); void queryClient.invalidateQueries({ queryKey: getGetCreatorQueryKey(post.author.id) }); },
      onError: (e) => { setFollowing(post.author.following); toast({ title: "Follow didn't save", description: errMessage(e), variant: "destructive" }); },
    },
  });

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (active) void element.play().catch(() => setPlaying(false));
    else { element.pause(); audioRef.current?.pause(); }
  }, [active, playback.url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (active && playing && !muted && audio && soundtrack.url) void audio.play().catch(() => {});
    else audio?.pause();
  }, [active, playing, muted, soundtrack.url]);

  if (!post.media) return null;
  const togglePlay = () => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => setPlaying(false));
    else element.pause();
  };
  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
    const audio = audioRef.current;
    if (audio) { audio.muted = next; if (!next && playing) void audio.play().catch(() => {}); if (next) audio.pause(); }
  };
  const share = async () => {
    const url = `${window.location.origin}${basePath}/profile/${encodeURIComponent(post.author.username)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${post.author.name} on VastMind`, url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Creator link copied", description: "It opens their profile. Only people allowed to see their clips can watch them." }); }
    } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) toast({ title: "Couldn't share", description: errMessage(e), variant: "destructive" }); }
  };
  const profileHref = `/profile/${encodeURIComponent(post.author.id)}`;

  return <article className="relative flex h-full min-h-0 snap-start items-center justify-center overflow-hidden bg-[hsl(192_52%_9%)]" data-testid={`reel-${post.id}`} data-reel-id={post.id} onMouseEnter={onActive}>
    <video ref={videoRef} src={playback.url ?? undefined} muted={muted} playsInline loop preload={active ? "auto" : "none"} className={cn("absolute inset-0 h-full w-full object-contain", effectClass[post.effect])} aria-label={`Video by ${post.author.name}`}
      onPlay={() => { setPlaying(true); session.setPlaying(true); if (!muted && audioRef.current) void audioRef.current.play().catch(() => {}); }}
      onPause={() => { setPlaying(false); session.setPlaying(false); audioRef.current?.pause(); }}
      onEnded={() => session.markCompleted()}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (v.currentTime + 0.5 < lastTime.current && lastTime.current > (v.duration || 0) - 1.5) session.markCompleted();
        lastTime.current = v.currentTime;
        if (hasCaptions) setTime(v.currentTime);
      }} />
     {playback.error ? <div role="alert" className="absolute inset-0 z-10 grid place-items-center bg-[hsl(192_52%_9%/.8)] p-6 text-center text-white"><button onClick={playback.retry} className="rounded-full bg-white/15 px-4 py-3 text-sm font-semibold">Video unavailable. Tap to retry.</button></div> : null}
     {post.audioMedia && soundtrack.url ? <audio ref={audioRef} src={soundtrack.url} muted={muted} loop preload={active ? "auto" : "none"} /> : null}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(192_55%_5%/.94)] via-transparent to-[hsl(192_55%_5%/.13)]" />
    <button className="absolute inset-0 z-[1] cursor-pointer" onClick={togglePlay} aria-label={playing ? "Pause video" : "Play video"} data-testid={`button-play-${post.id}`} />
    {!playing && active ? <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[2] grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur"><Play className="ml-1 h-6 w-6 fill-current" /></span> : null}
    {cue ? <p className="pointer-events-none absolute inset-x-6 top-[58%] z-[3] mx-auto w-fit max-w-[min(86%,560px)] rounded-lg bg-black/70 px-3 py-1.5 text-center text-[15px] font-semibold leading-snug text-white" aria-live="off" data-testid={`text-cue-${post.id}`}>{cue}</p> : null}
    <div className="absolute bottom-0 left-0 right-16 z-[3] p-5 pb-7 text-white sm:left-5 sm:max-w-[min(78%,540px)] sm:p-7">
      <div className="flex items-center gap-2.5">
        <Link href={profileHref} aria-label={`Open ${post.author.name}'s profile`}><UserAvatar id={post.author.id} name={post.author.name} src={post.author.avatarUrl} size="md" /></Link>
        <Link href={profileHref} className="min-w-0 hover:underline" data-testid={`link-video-creator-${post.id}`}>
          <span className="block truncate text-sm font-bold">{post.author.name}</span><span className="block text-xs text-white/70">@{post.author.username}</span>
        </Link>
        {!following ? <Button size="sm" variant="outline" className="h-8 rounded-full border-white/50 bg-white/10 text-white hover:bg-white/20" onClick={() => { setFollowing(true); follow.mutate({ userId: post.author.id }); }} disabled={follow.isPending} data-testid={`button-follow-${post.author.id}`}>Follow</Button> : <button onClick={() => { setFollowing(false); follow.mutate({ userId: post.author.id }); }} disabled={follow.isPending} className="rounded-full border border-white/25 px-3 py-1 text-[11px] text-white/70 hover:bg-white/10" aria-label={`Unfollow ${post.author.name}`}>Following</button>}
      </div>
      <p className="mt-4 line-clamp-4 max-w-xl whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed text-white [text-shadow:0_1px_8px_rgba(0,0,0,.7)]" data-testid={`text-video-caption-${post.id}`}>{post.content}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-white/80">
        <span className="rounded-full border border-white/30 bg-black/20 px-2.5 py-1">{post.effect === "none" ? "Original look" : `${post.effect} look`}</span>
        {post.communityName ? <span className="rounded-full border border-white/30 bg-black/20 px-2.5 py-1">{post.communityName}</span> : null}
        {post.audioMedia ? <span className="inline-flex max-w-[210px] items-center gap-1 rounded-full border border-white/30 bg-black/20 px-2.5 py-1"><Music2 className="h-3 w-3 shrink-0" /><span className="truncate">Creator's sound · {post.audioMedia.name}</span></span> : <span className="rounded-full border border-white/30 bg-black/20 px-2.5 py-1">Original sound</span>}
      </div>
    </div>
    <div className="absolute bottom-7 right-3 z-[4] flex flex-col items-center gap-3.5 text-white sm:right-5">
      <button onClick={togglePlay} className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur" aria-label={playing ? "Pause clip" : "Play clip"}>{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
      <button onClick={toggleSound} className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur" aria-label={muted ? "Turn sound on" : "Mute sound"} data-testid={`button-sound-${post.id}`}>{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
      {hasCaptions ? <button onClick={toggleCc} aria-pressed={ccOn} className={cn("grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur", ccOn && "text-[hsl(42_90%_65%)]")} aria-label={ccOn ? "Hide captions" : "Show captions"} data-testid={`button-cc-${post.id}`}>{ccOn ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}</button> : null}
      <button onClick={() => react.mutate({ postId: post.id, data: { reaction: "like" } })} disabled={react.isPending} className="flex flex-col items-center gap-1" aria-label={stats.reacted ? "Unlike clip" : "Like clip"} aria-pressed={stats.reacted} data-testid={`button-like-${post.id}`}><span className={cn("grid h-12 w-12 place-items-center rounded-full bg-black/35 backdrop-blur", stats.reacted && "text-primary")}><Heart className={cn("h-6 w-6", stats.reacted && "fill-current")} /></span><span className="text-xs font-semibold">{stats.reactions}</span></button>
      <button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1" aria-label={`View ${stats.comments} comments`} data-testid={`button-open-comments-${post.id}`}><span className="grid h-12 w-12 place-items-center rounded-full bg-black/35 backdrop-blur"><MessageCircle className="h-6 w-6" /></span><span className="text-xs font-semibold">{stats.comments}</span></button>
      <button onClick={() => void share()} className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur" aria-label="Share creator link" data-testid={`button-share-${post.id}`}><Share2 className="h-5 w-5" /></button>
      <span className="font-mono text-[10px] text-white/65">{index + 1}</span>
    </div>
    {commentsOpen ? <CommentsPanel post={post} count={stats.comments} onAdded={() => setStats((s) => ({ ...s, comments: s.comments + 1 }))} onClose={() => setCommentsOpen(false)} /> : null}
  </article>;
}
