"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Newspaper, Search, X } from "lucide-react";
import { useGetFeed, getGetFeedQueryKey, useListCommunities, getListCommunitiesQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Composer } from "@/components/feed/composer";
import { PostCard } from "@/components/feed/post-card";
import { usePollInterval } from "@/lib/realtime";

// ---------- Feed: composer, search, optional community filter ----------
function FeedInner() {
  const sp = useSearchParams();
  const communityId = sp.get("community") ?? undefined;
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);
  const params = dq || communityId ? { ...(dq ? { q: dq } : {}), ...(communityId ? { communityId } : {}) } : undefined;
  const poll = usePollInterval(30_000);
  const feed = useGetFeed(params, { query: { queryKey: getGetFeedQueryKey(params), refetchInterval: poll } });
  const communities = useListCommunities(undefined, { query: { queryKey: getListCommunitiesQueryKey(), staleTime: 60_000 } });
  const community = communities.data?.find((c) => c.id === communityId);

  return (
    <PageScroll>
      <PageHeader kicker="The street" title={community ? community.name : "Feed"} sub={community ? community.description : "Posts and polls from the people and communities you're part of."} />
      {community ? (
        <Link href="/feed" className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><X className="h-3 w-3" /> Clear community filter</Link>
      ) : null}
      <div className="relative mt-6">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts" className="h-11 rounded-full bg-card pl-10" aria-label="Search posts" data-testid="input-search-feed" />
      </div>
      <div className="mt-5"><Composer key={communityId ?? "all"} defaultCommunityId={community?.membership === "member" ? communityId : undefined} /></div>
      <div className="mt-6 space-y-4">
        {feed.isLoading ? <CardSkeleton /> : null}
        {feed.isError ? <ErrorState error={feed.error} onRetry={() => feed.refetch()} /> : null}
        {feed.data?.length === 0 ? (
          <EmptyState icon={Newspaper} title={dq ? "Nothing matches" : "Quiet on the street"} body={dq ? `No posts mention “${dq}”.` : "Be the first to post — or join a community to fill your feed."} />
        ) : null}
        {feed.data?.map((p, i) => <PostCard key={p.id} post={p} index={i} />)}
      </div>
    </PageScroll>
  );
}

export default function FeedPage() {
  return <Suspense fallback={<PageScroll><CardSkeleton /></PageScroll>}><FeedInner /></Suspense>;
}
