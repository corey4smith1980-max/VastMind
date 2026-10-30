"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clapperboard, MessagesSquare, Newspaper, RefreshCw, Search, ShoppingBag, X } from "lucide-react";
import type { GetVideosFeed } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardSkeleton, ErrorState } from "@/components/states";
import { PageScroll } from "@/components/page-scroll";
import { Composer } from "@/components/feed/composer";
import { PostCard } from "@/components/feed/post-card";
import { usePagedVideos } from "@/components/videos/video-kit";
import { cn } from "@/lib/utils";

const FEEDS: { id: GetVideosFeed; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "following", label: "Following" },
];

/** Community is a public, Facebook-style board; clips live only in Feed. */
export default function HomeFeedPage() {
  const [feed, setFeed] = useState<GetVideosFeed>("latest");
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  useEffect(() => {
    const timeout = window.setTimeout(() => setSettledSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const timeline = usePagedVideos({ surface: "community", feed, q: settledSearch });
  // Hide legacy group-scoped posts while the old data is being retired.
  const posts = timeline.items.filter((post) => !post.communityId);

  return (
    <PageScroll className="mx-auto w-full max-w-[1440px]" data-testid="page-home-feed">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">VastMind</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Community</h1>
           <p className="mt-1 text-sm text-muted-foreground">Public conversations, photos and polls. Clips stay in Feed.</p>
        </div>
        <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Refresh posts" onClick={timeline.refresh} data-testid="button-refresh-home">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid gap-6 xl:grid-cols-[230px_minmax(0,680px)_260px] xl:justify-center">
        <aside className="hidden xl:block" aria-label="Community shortcuts">
          <section className="sticky top-4 rounded-2xl border bg-card p-3">
            <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shortcuts</h2>
            <nav className="space-y-1">
              <Link href="/chats" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-muted"><MessagesSquare className="h-4 w-4 text-primary" />Chats</Link>
              <Link href="/videos" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-muted"><Clapperboard className="h-4 w-4 text-primary" />Short videos</Link>
              <Link href="/shop" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-muted"><ShoppingBag className="h-4 w-4 text-primary" />Shop</Link>
            </nav>
          </section>
        </aside>

        <main className="mx-auto w-full max-w-[680px] min-w-0 space-y-4">
          <Composer onPublished={timeline.refresh} />
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Community posts"
              aria-label="Search Community posts"
              type="search"
              className="h-11 rounded-full bg-card pl-10 pr-10"
              data-testid="input-search-community"
            />
            {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear Community search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button> : null}
          </div>
          <div className="flex rounded-full border bg-card p-1" role="tablist" aria-label="Choose posts">
            {FEEDS.map((option) => (
              <button key={option.id} type="button" role="tab" aria-selected={feed === option.id} onClick={() => setFeed(option.id)}
                className={cn("min-h-9 flex-1 rounded-full px-4 text-sm font-semibold transition-colors", feed === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                data-testid={`tab-home-${option.id}`}>{option.label}</button>
            ))}
          </div>

          {timeline.isLoading && posts.length === 0 ? <div className="space-y-4" aria-label="Loading posts"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div> : null}
          {timeline.isError && posts.length === 0 ? <ErrorState error={timeline.error} title="Couldn't load posts" onRetry={timeline.retry} /> : null}
          {!timeline.isLoading && !timeline.isError && posts.length === 0 ? (
            <section className="rounded-2xl border bg-card px-6 py-12 text-center">
              <Newspaper className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-4 font-display text-xl font-semibold">{settledSearch ? "No matching posts" : "Your Community starts here"}</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{settledSearch ? `No Community posts match “${settledSearch}”. Try another search.` : "Share a post, photo, or poll to start a conversation."}</p>
              {settledSearch ? <Button type="button" variant="outline" className="mt-5 rounded-full" onClick={() => setSearch("")}>Clear search</Button> : <Button asChild variant="outline" className="mt-5 rounded-full"><Link href="/videos">Explore Feed clips</Link></Button>}
            </section>
          ) : null}
          <div className="space-y-4">{posts.map((post, index) => <PostCard key={post.id} post={post} index={index} />)}</div>
          {timeline.hasMore ? <Button type="button" variant="outline" className="w-full rounded-full" disabled={timeline.loadingMore} onClick={timeline.loadNext} data-testid="button-load-more-home">
            {timeline.loadingMore ? "Loading…" : "Load more posts"}
          </Button> : null}
        </main>

        <aside className="hidden xl:block" aria-label="About your feed">
          <section className="sticky top-4 rounded-2xl border bg-card p-4">
            <h2 className="font-semibold">Your feed</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Posts from people you follow appear here. Share a thought, add a photo, or ask a question with a poll.</p>
            <div className="mt-4 border-t pt-4">
              <Link href="/videos" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><Clapperboard className="h-4 w-4" />Watch short videos</Link>
            </div>
          </section>
        </aside>
      </div>
    </PageScroll>
  );
}
