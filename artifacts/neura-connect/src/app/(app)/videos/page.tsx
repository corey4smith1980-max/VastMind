"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clapperboard, Info, Plus, RefreshCw, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetVideosQueryKey, useResetVideoHistory, useListCommunities, getListCommunitiesQueryKey, type GetVideosFeed } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateChoiceDialog, type CreateMode } from "@/components/videos/create-choice";
import { StatusShortcut } from "@/components/status/status-ring";
import { ClipComposer } from "@/components/videos/clip-composer";
import { ReelStack } from "@/components/videos/reel-stack";
import { usePagedVideos } from "@/components/videos/video-kit";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/me";

const FEEDS: { id: GetVideosFeed; label: string; why: string; empty: string }[] = [
  { id: "for-you", label: "For You", why: "Ordered using who you follow, the communities you share, and how you have watched clips here. It never uses your private chats.", empty: "Nothing to suggest yet. Follow a few people or join a community and this fills in." },
  { id: "following", label: "Following", why: "Posts and clips from people you follow, newest first.", empty: "People you follow haven't shared posts or clips yet." },
  { id: "latest", label: "Latest", why: "Posts and clips you're allowed to see, newest first. No ranking.", empty: "No posts or clips have been shared yet." },
];

function Feed({ feed, onCreate, q, communityId }: { feed: GetVideosFeed; onCreate: () => void; q: string; communityId?: string }) {
  const videos = usePagedVideos({ feed, includePosts: true, q, communityId });
  const meta = FEEDS.find((f) => f.id === feed)!;
  if (videos.isLoading && videos.items.length === 0) return <div className="grid flex-1 place-items-center" aria-label="Loading clips"><div className="w-full max-w-[390px] px-8"><div className="aspect-[9/15] animate-pulse rounded-[2rem] bg-white/[.07]" /><div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-white/10" /><div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/[.06]" /></div></div>;
  if (videos.isError && videos.items.length === 0) return <section role="alert" className="m-auto max-w-sm px-6 text-center text-white">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10"><RefreshCw className="h-6 w-6 text-white/75" /></span>
    <h1 className="mt-5 font-display text-2xl">The reel missed a beat.</h1><p className="mt-2 text-sm text-white/65">{errMessage(videos.error)}</p>
    <Button onClick={videos.retry} variant="secondary" className="mt-5 rounded-full" data-testid="button-retry-videos">Try again</Button>
  </section>;
  if (videos.items.length === 0) return <section className="m-auto max-w-sm px-6 text-center text-white">
    <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.4rem] border border-white/10 bg-white/[.06]"><Sparkles className="h-7 w-7 text-[hsl(42_90%_65%)]" /></span>
    <p className="mt-5 font-mono text-[10px] uppercase tracking-[.24em] text-white/50">{meta.label}</p>
    <h1 className="mt-2 font-display text-3xl">{q ? "Nothing matches." : "Your circle, in motion."}</h1>
    <p className="mx-auto mt-3 max-w-[290px] text-sm leading-relaxed text-white/65">{q ? `No posts or clips mention “${q}”.` : meta.empty}</p>
    <Button onClick={onCreate} className="mt-6 rounded-full px-5" data-testid="button-first-clip"><Plus className="mr-2 h-4 w-4" />Share something</Button>
  </section>;
  return <ReelStack items={videos.items} hasMore={videos.hasMore} loadingMore={videos.loadingMore} error={videos.isError} onLoadMore={videos.loadNext} onRetry={videos.retry} label="Clips and posts. Scroll to move between entries." />;
}

export default function VideosPage() {
  return <Suspense fallback={<main className="h-full bg-[hsl(192_45%_12%)]" />}><VideosInner /></Suspense>;
}

function VideosInner() {
  const sp = useSearchParams();
  const communityId = sp.get("community") ?? undefined;
  const urlQ = sp.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [dq, setDq] = useState(urlQ.trim());
  useEffect(() => { setQ(urlQ); setDq(urlQ.trim()); }, [urlQ]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const search = q.trim();
      setDq(search);
      // Keep the visible input, timeline key and saved/deep-linked URL in sync.
      // The App Router integrates native history updates without remounting a
      // draft or making a second server navigation for every search change.
      const params = new URLSearchParams(window.location.search);
      if (search) params.set("q", search); else params.delete("q");
      const suffix = params.toString();
      const target = `${window.location.pathname}${suffix ? `?${suffix}` : ""}${window.location.hash}`;
      if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(null, "", target);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const communities = useListCommunities(undefined, { query: { queryKey: getListCommunitiesQueryKey(), staleTime: 60_000 } });
  const community = communities.data?.find((c) => c.id === communityId);
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [feed, setFeed] = useState<GetVideosFeed>("for-you");
  const [generation, setGeneration] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const me = useMe();
  const [confirmReset, setConfirmReset] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reload = () => { setGeneration((g) => g + 1); void queryClient.invalidateQueries({ queryKey: getGetVideosQueryKey() }); };
  const reset = useResetVideoHistory({ mutation: {
    onSuccess: () => { setConfirmReset(false); setInfoOpen(false); reload(); toast({ title: "Viewing history cleared", description: "For You starts fresh from your follows and communities." }); },
    onError: (e) => toast({ title: "Couldn't clear history", description: errMessage(e), variant: "destructive" }),
  } });
  const meta = FEEDS.find((f) => f.id === feed)!;

  return <main className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(192_45%_12%)]" data-testid="page-videos">
    <header className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[hsl(192_49%_12%)] px-4 py-2.5 text-white sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(12_82%_52%)] text-white"><Clapperboard className="h-[18px] w-[18px]" /></span>
        <p className="hidden font-display text-lg leading-tight md:block">Everyday, in motion</p>
      </div>
      <div role="tablist" aria-label="Choose a clip feed" className="order-3 flex w-full rounded-full bg-white/[.07] p-1 sm:order-none sm:w-auto">
        {FEEDS.map((f) => <button key={f.id} role="tab" aria-selected={feed === f.id} onClick={() => setFeed(f.id)} className={cn("flex-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors sm:flex-none", feed === f.id ? "bg-[hsl(40_50%_96%)] text-[hsl(192_52%_12%)]" : "text-white/70 hover:text-white")} data-testid={`tab-feed-${f.id}`}>{f.label}</button>)}
      </div>
      <div className="flex items-center gap-1.5">
        <StatusShortcut meId={me.id} />
        <Button onClick={() => setInfoOpen((o) => !o)} variant="ghost" size="icon" aria-label="Why am I seeing these clips?" aria-expanded={infoOpen} className="rounded-full text-white/75 hover:bg-white/10 hover:text-white" data-testid="button-feed-info"><Info className="h-4 w-4" /></Button>
        <Button onClick={reload} variant="ghost" size="icon" aria-label="Refresh clips" className="rounded-full text-white/75 hover:bg-white/10 hover:text-white" data-testid="button-refresh-videos"><RefreshCw className="h-4 w-4" /></Button>
        <Button onClick={() => setCreateMode("choose")} size="sm" aria-haspopup="dialog" className="rounded-full px-4" data-testid="button-create-clip"><Plus className="mr-1.5 h-4 w-4" />Create</Button>
      </div>
    </header>
    <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[hsl(192_49%_12%)] px-4 pb-2.5 sm:px-7">
      <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts and clips" aria-label="Search posts and clips" className="h-8 rounded-full border-white/10 bg-white/[.07] pl-8 text-xs text-white placeholder:text-white/45" data-testid="input-search-feed" />
      </div>
      {communityId ? <Link href="/videos" className="inline-flex items-center gap-1 rounded-full bg-[hsl(42_90%_65%/.15)] px-3 py-1 text-xs font-medium text-[hsl(42_90%_72%)] hover:bg-[hsl(42_90%_65%/.25)]" data-testid="link-clear-community"><X className="h-3 w-3" />{community ? community.name : "Community"} · clear</Link> : null}
    </div>
    {infoOpen ? <section className="absolute right-3 top-[70px] z-30 w-[min(360px,calc(100%-1.5rem))] rounded-2xl border border-white/10 bg-[hsl(192_46%_10%/.97)] p-5 text-white shadow-2xl backdrop-blur" aria-label="How this feed works">
      <div className="flex items-start justify-between gap-3"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(42_90%_65%)]">Why these clips</p><button onClick={() => { setInfoOpen(false); setConfirmReset(false); }} aria-label="Close" className="rounded-full p-1 text-white/60 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
      <p className="mt-2 text-sm leading-relaxed text-white/85"><span className="font-semibold">{meta.label}.</span> {meta.why}</p>
      <div className="mt-4 border-t border-white/10 pt-4">
        {!confirmReset ? <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setConfirmReset(true)} data-testid="button-reset-history"><RotateCcw className="mr-2 h-3.5 w-3.5" />Reset viewing history</Button> : <div role="alertdialog" aria-label="Confirm reset">
          <p className="text-sm text-white/80">Clear what you've watched? For You will stop using it. This can't be undone.</p>
          <div className="mt-3 flex gap-2"><Button size="sm" variant="destructive" className="rounded-full" disabled={reset.isPending} onClick={() => reset.mutate()} data-testid="button-confirm-reset">{reset.isPending ? "Clearing" : "Clear history"}</Button><Button size="sm" variant="ghost" className="rounded-full text-white hover:bg-white/10" onClick={() => setConfirmReset(false)}>Keep it</Button></div>
        </div>}
      </div>
    </section> : null}
    <div className="relative flex min-h-0 flex-1">
      <Feed key={`${feed}-${generation}-${dq}-${communityId ?? ""}`} feed={feed} q={dq} communityId={communityId} onCreate={() => setCreateMode("choose")} />
    </div>
    <CreateChoiceDialog mode={createMode} onMode={setCreateMode} onClip={() => setComposerOpen(true)} communityId={community?.membership === "member" ? communityId : undefined} onPublished={reload} />
    {composerOpen ? <ClipComposer onClose={(published) => { setComposerOpen(false); if (published) reload(); }} /> : null}
  </main>;
}
