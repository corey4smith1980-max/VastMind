"use client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getGetVideosQueryKey, getVideos } from "./generated/api";
import type { GetVideosParams } from "./generated/api.schemas";

/** Keep every loaded page reactive, not just the last cursor. Invalidations
 * rebuild the cursor chain in order, so reactions, votes and new posts remain
 * visible after paging on either client. Never mix regular/infinite cache data. */
export function usePagedSocialTimeline(input: Omit<GetVideosParams, "before">, enabled = true) {
  const base = {
    surface: input.surface ?? "feed",
    ...(input.feed ? { feed: input.feed } : {}),
    ...(input.creatorId ? { creatorId: input.creatorId } : {}),
    ...(input.q?.trim() ? { q: input.q.trim() } : {}),
    ...(input.topic ? { topic: input.topic } : {}),
  };
  const client = useQueryClient();
  // Cache version separates this strict destination filter from older mixed
  // timeline entries that may still be present in a running client session.
  const key = [...getGetVideosQueryKey(base), "infinite", "surface-isolation-v2"];
  const query = useInfiniteQuery({
    queryKey: key,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getVideos({ ...base, ...(pageParam ? { before: pageParam } : {}) }, { signal }),
    getNextPageParam: page => page.nextBefore ?? undefined,
  });
  const seen = new Set<string>();
  const items = (query.data?.pages.flatMap(page => page.items) ?? []).filter(post => {
    const isClip = post.media?.contentType.toLowerCase().startsWith("video/") ?? false;
    if (seen.has(post.id) || post.surface !== base.surface ||
      (base.surface === "community" && !post.communityTopic) ||
      (base.surface === "feed" && !isClip) || (base.surface !== "feed" && isClip)) return false;
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
