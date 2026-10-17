"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Clapperboard, Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetVideosQueryKey, useGetVideos, type GetVideosParams, type Post } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ClipComposer } from "@/components/videos/clip-composer";
import { ReelCard } from "@/components/videos/reel-card";

function isClip(post: Post) {
  return !!post.media?.contentType.toLowerCase().startsWith("video/");
}

export default function VideosPage() {
  const [before, setBefore] = useState<string | undefined>();
  const [items, setItems] = useState<Post[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const params = useMemo<GetVideosParams | undefined>(() => before ? { before } : undefined, [before]);
  const videos = useGetVideos(params, { query: { queryKey: getGetVideosQueryKey(params) } });
  const pageItems = useMemo(() => (videos.data?.items ?? []).filter(isClip), [videos.data]);

  useEffect(() => {
    if (!videos.data) return;
    setItems((current) => {
      const seen = new Set(current.map((post) => post.id));
      const next = pageItems.filter((post) => !seen.has(post.id));
      return before ? [...current, ...next] : pageItems;
    });
    if (!before && pageItems[0]) setActiveId(pageItems[0].id);
  }, [videos.data, pageItems, before]);

  const loadNext = useCallback(() => {
    const cursor = videos.data?.nextBefore;
    if (cursor && !videos.isFetching && cursor !== before) setBefore(cursor);
  }, [before, videos.data?.nextBefore, videos.isFetching]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = tailRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadNext();
    }, { root, rootMargin: "0px 0px 600px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadNext, items.length]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-testid^='reel-']"));
    if (!cards.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const id = visible?.target.getAttribute("data-testid")?.slice("reel-".length);
      if (id) setActiveId(id);
      else {
        const exited = entries.some((entry) => !entry.isIntersecting && entry.target.getAttribute("data-testid")?.slice("reel-".length) === activeId);
        if (exited) setActiveId(null);
      }
    }, { root, threshold: [0.55, 0.75] });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items.length, activeId]);

  const refresh = () => {
    setBefore(undefined);
    setItems([]);
    setActiveId(null);
    void queryClient.invalidateQueries({ queryKey: getGetVideosQueryKey() });
    void videos.refetch();
  };

  return <main className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(192_45%_12%)]" data-testid="page-videos">
    <header className="relative z-10 flex h-[62px] shrink-0 items-center justify-between border-b border-white/10 bg-[hsl(192_49%_12%)] px-4 text-white sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(12_82%_52%)] text-white"><Clapperboard className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0"><p className="font-display text-lg leading-tight">Everyday, in motion</p><p className="hidden text-[10px] uppercase tracking-[.19em] text-white/50 sm:block">Clips from your people</p></div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={refresh} variant="ghost" size="icon" aria-label="Refresh clips" className="rounded-full text-white/75 hover:bg-white/10 hover:text-white" data-testid="button-refresh-videos"><RefreshCw className={videos.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></Button>
        <Button onClick={() => setComposerOpen(true)} size="sm" className="rounded-full px-4" data-testid="button-create-clip"><Plus className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">Create clip</span><span className="sm:hidden">Create</span></Button>
      </div>
    </header>
    <div className="relative flex min-h-0 flex-1">
      {videos.isLoading && items.length === 0 ? <div className="absolute inset-0 z-10 grid place-items-center bg-[hsl(192_45%_12%)]" aria-label="Loading clips"><div className="w-full max-w-[390px] px-8"><div className="aspect-[9/15] animate-pulse rounded-[2rem] bg-white/[.07]" /><div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-white/10" /><div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/[.06]" /></div></div> : null}
      {videos.isError && items.length === 0 ? <section role="alert" className="m-auto max-w-sm px-6 text-center text-white">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10"><RefreshCw className="h-6 w-6 text-white/75" /></span>
        <h1 className="mt-5 font-display text-2xl">The reel missed a beat.</h1><p className="mt-2 text-sm text-white/65">Your clips couldn't load just now. Try again in a moment.</p>
        <Button onClick={() => void videos.refetch()} variant="secondary" className="mt-5 rounded-full" data-testid="button-retry-videos">Try again</Button>
      </section> : null}
      {!videos.isLoading && !videos.isError && items.length === 0 ? <section className="m-auto max-w-sm px-6 text-center text-white">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.4rem] border border-white/10 bg-white/[.06]"><Sparkles className="h-7 w-7 text-[hsl(42_90%_65%)]" /></span>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[.24em] text-white/50">A fresh start</p>
        <h1 className="mt-2 font-display text-3xl">Your circle, in motion.</h1>
        <p className="mx-auto mt-3 max-w-[290px] text-sm leading-relaxed text-white/65">Share a useful trick, a tiny win, or the view on your walk. Short clips from real people live here.</p>
        <Button onClick={() => setComposerOpen(true)} className="mt-6 rounded-full px-5" data-testid="button-first-clip"><Plus className="mr-2 h-4 w-4" />Share the first clip</Button>
      </section> : null}
      {items.length > 0 ? <>
        <div ref={scrollRef} tabIndex={0} role="feed" className="reel-scroll min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" aria-label="Short video feed. Scroll to move between clips." data-testid="video-reel-feed">
          {items.map((post, index) => <ReelCard key={post.id} post={post} index={index} active={activeId === post.id} onActive={() => setActiveId(post.id)} />)}
          <div ref={tailRef} className="flex min-h-24 snap-start items-center justify-center text-xs text-white/55" aria-live="polite">
            {videos.isFetching && before ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finding more moments</> : videos.isError ? <button onClick={() => void videos.refetch()} className="rounded-full bg-white/10 px-4 py-2 underline hover:bg-white/15">Couldn't load more · retry</button> : videos.data?.nextBefore ? <button onClick={loadNext} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 hover:bg-white/15"><ArrowDown className="h-4 w-4" />Keep watching</button> : <span>You're all caught up.</span>}
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-4 z-[5] hidden items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-white/60 backdrop-blur sm:flex"><span className="grid h-5 w-5 place-items-center rounded-full bg-white/10"><ArrowDown className="h-3 w-3" /></span>Scroll to move through clips</div>
      </> : null}
    </div>
    {composerOpen ? <ClipComposer onClose={() => { setComposerOpen(false); setBefore(undefined); setItems([]); setActiveId(null); void queryClient.invalidateQueries({ queryKey: getGetVideosQueryKey() }); }} /> : null}
  </main>;
}
