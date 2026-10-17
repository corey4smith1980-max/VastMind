"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetVideosQueryKey, useGetVideos, useRecordVideoEngagement, type CaptionCue, type GetVideosFeed, type GetVideosParams, type Post } from "@workspace/api-client-react";

export function isClip(post: Post) {
  return !!post.media?.contentType.toLowerCase().startsWith("video/");
}

export function activeCue(cues: CaptionCue[] | undefined, time: number) {
  if (!cues?.length) return null;
  return cues.find((cue) => time >= cue.start && time < cue.end)?.text ?? null;
}

export function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error && typeof (error as { status: unknown }).status === "number") return (error as { status: number }).status;
  return undefined;
}

/** Captions preference shared by every clip on this device. */
export function useCaptionsPref(): [boolean, () => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const stored = window.localStorage.getItem("vastmind-cc");
    if (stored === "off") setOn(false);
    const sync = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener("vastmind-cc", sync);
    return () => window.removeEventListener("vastmind-cc", sync);
  }, []);
  const toggle = useCallback(() => {
    setOn((current) => {
      const next = !current;
      window.localStorage.setItem("vastmind-cc", next ? "on" : "off");
      window.dispatchEvent(new CustomEvent("vastmind-cc", { detail: next }));
      return next;
    });
  }, []);
  return [on, toggle];
}

/**
 * One engagement report per visible viewing session. Watch time accumulates
 * only while the clip is actually playing and is sent when the clip leaves
 * view, the tab hides, or the card unmounts. Never a per-second heartbeat.
 */
export function useWatchSession(postId: string, active: boolean) {
  const record = useRecordVideoEngagement();
  const mutateRef = useRef(record.mutate);
  mutateRef.current = record.mutate;
  const session = useRef({ acc: 0, since: null as number | null, completed: false });
  const flush = useCallback(() => {
    const s = session.current;
    if (s.since !== null) { s.acc += performance.now() - s.since; s.since = null; }
    const watchMs = Math.min(90000, Math.max(0, Math.round(s.acc)));
    if (watchMs >= 1000 || s.completed) mutateRef.current({ postId, data: { watchMs, completed: s.completed } });
    session.current = { acc: 0, since: null, completed: false };
  }, [postId]);
  const setPlaying = useCallback((playing: boolean) => {
    const s = session.current;
    if (playing && s.since === null) s.since = performance.now();
    else if (!playing && s.since !== null) { s.acc += performance.now() - s.since; s.since = null; }
  }, []);
  const markCompleted = useCallback(() => { session.current.completed = true; }, []);
  useEffect(() => { if (!active) flush(); }, [active, flush]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); flush(); };
  }, [flush]);
  return { setPlaying, markCompleted };
}

type Base = { feed?: GetVideosFeed; creatorId?: string };

/** Cursor-paged clip list. The opaque cursor resets whenever feed or creator changes. */
export function usePagedVideos(base: Base, enabled = true) {
  const baseKey = JSON.stringify(base);
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ key: string; before?: string; items: Post[] }>({ key: baseKey, items: [] });
  if (state.key !== baseKey) setState({ key: baseKey, items: [] });
  const before = state.key === baseKey ? state.before : undefined;
  const params = useMemo<GetVideosParams>(() => ({ ...(JSON.parse(baseKey) as Base), ...(before ? { before } : {}) }), [baseKey, before]);
  const query = useGetVideos(params, { query: { queryKey: getGetVideosQueryKey(params), enabled } });

  useEffect(() => {
    if (!query.data) return;
    const page = query.data.items.filter(isClip);
    setState((s) => {
      if (s.key !== baseKey || (s.before ?? null) !== (params.before ?? null)) return s;
      if (!s.before) return { ...s, items: page };
      const seen = new Set(s.items.map((p) => p.id));
      return { ...s, items: [...s.items, ...page.filter((p) => !seen.has(p.id))] };
    });
  }, [query.data, baseKey, params.before]);

  const cursor = query.data?.nextBefore ?? null;
  const loadNext = useCallback(() => {
    if (cursor && !query.isFetching) setState((s) => (s.before === cursor ? s : { ...s, before: cursor }));
  }, [cursor, query.isFetching]);
  const refresh = useCallback(() => {
    setState({ key: baseKey, items: [] });
    void queryClient.invalidateQueries({ queryKey: getGetVideosQueryKey() });
  }, [baseKey, queryClient]);

  return {
    items: state.key === baseKey ? state.items : [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    loadingMore: query.isFetching && !!before,
    hasMore: !!cursor,
    loadNext,
    refresh,
    retry: () => void query.refetch(),
  };
}
