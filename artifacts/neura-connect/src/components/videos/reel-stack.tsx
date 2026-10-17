"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import type { Post } from "@workspace/api-client-react";
import { ReelCard } from "./reel-card";

/** Vertical snap feed. Exactly one clip (the most visible one) plays at a time. */
export function ReelStack({ items, hasMore, loadingMore, error, onLoadMore, onRetry, initialId, label = "Short video feed. Scroll to move between clips." }: {
  items: Post[]; hasMore: boolean; loadingMore: boolean; error: boolean; onLoadMore: () => void; onRetry: () => void; initialId?: string; label?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(initialId ?? items[0]?.id ?? null);
  const loadRef = useRef(onLoadMore);
  loadRef.current = onLoadMore;

  useEffect(() => {
    if (!initialId) return;
    scrollRef.current?.querySelector(`[data-reel-id="${CSS.escape(initialId)}"]`)?.scrollIntoView({ block: "start" });
  }, [initialId]);

  useEffect(() => {
    if (!activeId && items[0]) setActiveId(items[0].id);
  }, [activeId, items]);

  useEffect(() => {
    const root = scrollRef.current, target = tailRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) loadRef.current(); }, { root, rootMargin: "0px 0px 600px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-reel-id]"));
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => ratios.set(entry.target.getAttribute("data-reel-id") ?? "", entry.isIntersecting ? entry.intersectionRatio : 0));
      let best: string | null = null, bestRatio = 0.5;
      ratios.forEach((ratio, id) => { if (ratio > bestRatio) { best = id; bestRatio = ratio; } });
      setActiveId(best);
    }, { root, threshold: [0, 0.5, 0.75, 1] });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items.length]);

  return <div className="relative flex min-h-0 flex-1">
    <div ref={scrollRef} tabIndex={0} role="feed" aria-busy={loadingMore} className="reel-scroll min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" aria-label={label} data-testid="video-reel-feed">
      {items.map((post, index) => <ReelCard key={post.id} post={post} index={index} active={activeId === post.id} onActive={() => setActiveId(post.id)} />)}
      <div ref={tailRef} className="flex min-h-24 snap-start items-center justify-center text-xs text-white/55" aria-live="polite">
        {loadingMore ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finding more moments</> : error ? <button onClick={onRetry} className="rounded-full bg-white/10 px-4 py-2 underline hover:bg-white/15">Couldn't load more. Retry</button> : hasMore ? <button onClick={onLoadMore} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 hover:bg-white/15"><ArrowDown className="h-4 w-4" />Keep watching</button> : <span>You're all caught up.</span>}
      </div>
    </div>
    <div className="pointer-events-none absolute bottom-4 left-4 z-[5] hidden items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-white/60 backdrop-blur sm:flex"><span className="grid h-5 w-5 place-items-center rounded-full bg-white/10"><ArrowDown className="h-3 w-3" /></span>Scroll to move through clips</div>
  </div>;
}
