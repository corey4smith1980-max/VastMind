"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Film, Loader2, Lock, Newspaper, Play, UserX, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCreatorQueryKey, useGetCreator, useToggleUserFollow, type Post } from "@workspace/api-client-react";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/feed/composer";
import { PostCard } from "@/components/feed/post-card";
import { ReelStack } from "@/components/videos/reel-stack";
import { errorStatus, isClip, usePagedVideos } from "@/components/videos/video-kit";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { useMe } from "@/lib/me";

const effectClass = { none: "", warm: "sepia-[.2] saturate-[1.15]", mono: "grayscale", soft: "brightness-[1.06] saturate-[.82]" };

function ClipTile({ post, onPlay }: { post: Post; onPlay: () => void }) {
  return (
    <button onClick={onPlay} className="group relative aspect-[9/14] overflow-hidden rounded-xl bg-[hsl(192_50%_12%)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Play clip: ${post.content.slice(0, 80)}`} data-testid={`tile-clip-${post.id}`}>
      <span className={`absolute inset-0 grid place-items-center text-white/75 ${effectClass[post.effect]}`} aria-hidden><Film className="h-8 w-8" /></span>
      <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
      <span className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 text-xs font-semibold text-white"><Play className="h-3.5 w-3.5 shrink-0 fill-current" /><span className="truncate">{post.content}</span></span>
    </button>
  );
}

export default function CreatorProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = decodeURIComponent(params.userId ?? "");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const me = useMe();
  const creator = useGetCreator(userId, { query: { queryKey: getGetCreatorQueryKey(userId), enabled: !!userId } });
  const realId = creator.data?.user.id;
  const clips = usePagedVideos({ creatorId: realId ?? "" }, !!realId);
  const profileTimeline = usePagedVideos({ creatorId: realId ?? "", includePosts: true }, !!realId);
  const [playing, setPlaying] = useState<string | null>(null);
  const [section, setSection] = useState<"posts" | "clips">("posts");
  const follow = useToggleUserFollow({ mutation: {
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetCreatorQueryKey(userId) }); },
    onError: (e) => toast({ title: "Follow didn't save", description: errMessage(e), variant: "destructive" }),
  } });

  if (creator.isLoading) return <main className="mx-auto w-full max-w-4xl p-6" aria-label="Loading profile"><div className="flex items-center gap-5"><div className="h-24 w-24 animate-pulse rounded-full bg-muted" /><div className="flex-1 space-y-3"><div className="h-6 w-1/3 animate-pulse rounded bg-muted" /><div className="h-4 w-1/4 animate-pulse rounded bg-muted" /></div></div><div className="mt-10 grid grid-cols-3 gap-1.5">{Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[9/14] animate-pulse rounded-xl bg-muted" />)}</div></main>;
  if (creator.isError || !creator.data) {
    const status = errorStatus(creator.error);
    const Icon = status === 403 ? Lock : UserX;
    return <main className="grid h-full place-items-center p-6"><section role="alert" className="max-w-sm text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted"><Icon className="h-6 w-6 text-muted-foreground" /></span>
      <h1 className="mt-5 font-display text-2xl">{status === 403 ? "This profile is private" : status === 404 ? "No one here by that name" : "Couldn't open this profile"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{status === 403 ? "They share their clips only with people they've chosen." : status === 404 ? "The link may be old, or they may have left VastMind." : errMessage(creator.error)}</p>
      <div className="mt-5 flex justify-center gap-2">{status !== 403 && status !== 404 ? <Button onClick={() => void creator.refetch()} className="rounded-full">Try again</Button> : null}<Button asChild variant="outline" className="rounded-full"><Link href="/videos">Back to Feed</Link></Button></div>
    </section></main>;
  }
  const { user, bio, followersCount, followingCount, clipsCount } = creator.data;
  const isMe = me?.id === user.id;
  const profilePosts = profileTimeline.items.filter((post) => !post.communityId && !isClip(post));

  return <main className="h-full overflow-y-auto bg-background" data-testid="page-creator-profile">
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-5 sm:px-8">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Home</Link>
      <header className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end">
        <UserAvatar id={user.id} name={user.name} src={user.avatarUrl} size="xl" online={user.online} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Profile</p>
          <h1 className="mt-1 truncate font-display text-4xl" data-testid="text-creator-name">{user.name}</h1>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          {bio ? <p className="mt-3 max-w-xl whitespace-pre-wrap text-[15px] leading-relaxed">{bio}</p> : null}
        </div>
        {isMe ? <Button asChild variant="outline" className="rounded-full px-6"><Link href="/settings">Edit profile</Link></Button>
          : <Button onClick={() => follow.mutate({ userId: user.id })} disabled={follow.isPending} variant={user.following ? "outline" : "default"} className="rounded-full px-6" data-testid="button-follow-creator">{follow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : user.following ? "Following" : "Follow"}</Button>}
      </header>
      <dl className="mt-7 flex gap-8 border-y py-4">
        {[["Clips", clipsCount], ["Followers", followersCount], ["Following", followingCount]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-display text-2xl tabular-nums">{value}</dd></div>)}
      </dl>
      <div className="mt-6 flex rounded-full border bg-card p-1" role="tablist" aria-label={`${user.name}'s profile sections`}>
        {(["posts", "clips"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={section === tab} onClick={() => setSection(tab)}
          className={`min-h-10 flex-1 rounded-full px-4 text-sm font-semibold transition-colors ${section === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid={`tab-profile-${tab}`}>{tab === "posts" ? "Posts" : "Clips"}</button>)}
      </div>
      {section === "posts" ? <section className="mx-auto mt-5 max-w-2xl space-y-4" aria-label={`${user.name}'s posts`}>
        {isMe ? <Composer onPublished={profileTimeline.refresh} /> : null}
        {profileTimeline.isLoading && profilePosts.length === 0 ? <div className="space-y-3" aria-label="Loading profile posts"><div className="h-48 animate-pulse rounded-2xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div> : null}
        {profileTimeline.isError && profilePosts.length === 0 ? <div role="alert" className="rounded-2xl border p-6 text-center text-sm">{errorStatus(profileTimeline.error) === 403 ? "Their posts are only visible to people they've chosen." : <>Couldn't load posts. <button onClick={profileTimeline.retry} className="underline">Try again</button></>}</div> : null}
        {!profileTimeline.isLoading && !profileTimeline.isError && profilePosts.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center"><Newspaper className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 font-display text-xl">{isMe ? "Your profile starts here" : "No posts yet"}</p><p className="mt-1 text-sm text-muted-foreground">{isMe ? "Share a thought, photo, or poll with your followers." : "Their posts will appear here."}</p></div> : null}
        <div className="space-y-4">{profilePosts.map((post, index) => <PostCard key={post.id} post={post} index={index} />)}</div>
        {profileTimeline.hasMore ? <Button type="button" variant="outline" className="w-full rounded-full" disabled={profileTimeline.loadingMore} onClick={profileTimeline.loadNext} data-testid="button-load-more-profile-posts">{profileTimeline.loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Show more posts</Button> : null}
      </section> : <section className="mt-7" aria-label={`${user.name}'s clips`}>
        {clips.isLoading && clips.items.length === 0 ? <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[9/14] animate-pulse rounded-xl bg-muted" />)}</div> : null}
        {clips.isError && clips.items.length === 0 ? <div role="alert" className="rounded-2xl border p-6 text-center text-sm">{errorStatus(clips.error) === 403 ? "Their clips are only visible to people they've chosen." : <>Couldn't load clips. <button onClick={clips.retry} className="underline">Try again</button></>}</div> : null}
        {!clips.isLoading && !clips.isError && clips.items.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center"><Film className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 font-display text-xl">No clips you can see yet</p><p className="mt-1 text-sm text-muted-foreground">{isMe ? "Share one from the Clips tab." : "When they share one with you, it shows up here."}</p></div> : null}
        {clips.items.length > 0 ? <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {clips.items.map((post) => <ClipTile key={post.id} post={post} onPlay={() => setPlaying(post.id)} />)}
        </div> : null}
        {clips.items.length > 0 && clips.hasMore ? <div className="mt-6 text-center"><Button variant="outline" className="rounded-full" onClick={clips.loadNext} disabled={clips.isFetching}>{clips.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Show more clips</Button></div> : null}
      </section>
      }
    </div>
    {playing ? <div className="fixed inset-0 z-[70] flex flex-col bg-[hsl(192_52%_9%)]" role="dialog" aria-modal="true" aria-label={`${user.name}'s clips`}>
      <div className="flex h-14 shrink-0 items-center justify-between px-4 text-white"><p className="font-display text-lg">{user.name}</p><Button variant="ghost" size="icon" onClick={() => setPlaying(null)} className="rounded-full text-white hover:bg-white/10" aria-label="Close player"><X className="h-5 w-5" /></Button></div>
      <ReelStack items={clips.items} initialId={playing} hasMore={clips.hasMore} loadingMore={clips.loadingMore} error={clips.isError} onLoadMore={clips.loadNext} onRetry={clips.retry} label={`${user.name}'s clips`} />
    </div> : null}
  </main>;
}
