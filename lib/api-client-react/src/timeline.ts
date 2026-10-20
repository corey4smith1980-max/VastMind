"use client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getGetVideosQueryKey, getVideos } from "./generated/api";
import type { GetVideosParams } from "./generated/api.schemas";

/** Keep every loaded page reactive, not just the last cursor. Invalidations
 * rebuild the cursor chain in order, so reactions, votes and new posts remain
 * visible after paging on either client. Never mix regular/infinite cache data. */
export function usePagedSocialTimeline(input: Omit<GetVideosParams, "before">, enabled = true) {
  const base = {
    ...(input.feed ? { feed: input.feed } : {}),
    ...(input.creatorId ? { creatorId: input.creatorId } : {}),
    ...(input.includePosts ? { includePosts: true } : {}),
    ...(input.q?.trim() ? { q: input.q.trim() } : {}),
    ...(input.communityId ? { communityId: input.communityId } : {}),
  };
  const client = useQueryClient();
  const key = [...getGetVideosQueryKey(base), "infinite"];
  const query = useInfiniteQuery({
    queryKey: key,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getVideos({ ...base, ...(pageParam ? { before: pageParam } : {}) }, { signal }),
    getNextPageParam: page => page.nextBefore ?? undefined,
  });
  const seen = new Set<string>();
  const items = (query.data?.pages.flatMap(page => page.items) ?? []).filter(post => {
    if (seen.has(post.id) || (!base.includePosts && !post.media?.contentType.toLowerCase().startsWith("video/"))) return false;
    seen.add(post.id);
    return true;
  });
  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    loadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadNext: () => { if (query.hasNextPage && !query.isFetching) void query.fetchNextPage(); },
    refresh: () => { void client.resetQueries({ queryKey: key, exact: true }); },
    retry: () => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); },
  };
}
