import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { getGetVideosQueryKey, useGetVideos, useRecordVideoEngagement, type CaptionCue, type GetVideosFeed, type GetVideosParams, type MediaAttachment, type Post } from '@workspace/api-client-react';

export const apiOrigin = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
export const webProfileLink = (username: string) => `${apiOrigin}/neura-connect/profile/${encodeURIComponent(username)}`;

export const isClip = (post: Post) => !!post.media?.contentType.toLowerCase().startsWith('video/');
export const activeCue = (cues: CaptionCue[] | undefined, t: number) => cues?.find(c => t >= c.start && t < c.end)?.text ?? null;
export function errorStatus(error: unknown): number | undefined {
  return error && typeof error === 'object' && 'status' in error && typeof (error as { status: unknown }).status === 'number' ? (error as { status: number }).status : undefined;
}
export const errorText = (e: unknown) => e instanceof Error ? e.message : 'Please try again.';

/** Get a short-lived private read URL after auth; players can then seek with byte-range requests. */
export type AuthedSource = { uri: string; headers?: Record<string, string> };
export function useAuthedMedia(media: MediaAttachment | null | undefined, enabled = true) {
  const { getToken } = useAuth();
  const [state, setState] = useState<{ id: string; source: AuthedSource | null; error: boolean } | null>(null);
  const id = media?.id, url = media?.url;
  useEffect(() => {
    if (!id || !url || !enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const token = await getToken();
      if (!token) throw new Error('signed out');
      const separator = url.includes('?') ? '&' : '?';
      const response = await fetch(`${apiOrigin}${url}${separator}playback=1`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json() as { url?: unknown; expiresAt?: unknown };
      if (typeof result.url !== 'string' || typeof result.expiresAt !== 'number') throw new Error('unavailable');
      const playbackUrl = new URL(result.url, apiOrigin);
      if (playbackUrl.protocol !== 'https:' || playbackUrl.origin !== new URL(apiOrigin).origin) throw new Error('unavailable');
      if (!alive) return;
      setState({ id, source: { uri: playbackUrl.toString() }, error: false });
      const renewIn = Math.max(30_000, Math.min(13 * 60_000, result.expiresAt - Date.now() - 60_000));
      timer = setTimeout(() => { if (alive) void load().catch(() => setState({ id, source: null, error: true })); }, renewIn);
    };
    void load().catch(() => { if (alive) setState({ id, source: null, error: true }); });
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [id, url, enabled, getToken]);
  if (!state || state.id !== id) return { source: null, error: false };
  return { source: state.source, error: state.error };
}

let captionsOn = true;
const ccListeners = new Set<() => void>();
export function useCaptionsPref(): [boolean, () => void] {
  const on = useSyncExternalStore(cb => { ccListeners.add(cb); return () => { ccListeners.delete(cb); }; }, () => captionsOn, () => captionsOn);
  const toggle = useCallback(() => { captionsOn = !captionsOn; ccListeners.forEach(l => l()); }, []);
  return [on, toggle];
}

/** One engagement report per visible viewing session (leave view, background, unmount). */
export function useWatchSession(postId: string, active: boolean) {
  const record = useRecordVideoEngagement();
  const mutateRef = useRef(record.mutate);
  mutateRef.current = record.mutate;
  const s = useRef({ acc: 0, since: null as number | null, completed: false });
  const flush = useCallback(() => {
    const st = s.current;
    if (st.since !== null) { st.acc += Date.now() - st.since; st.since = null; }
    const watchMs = Math.min(90000, Math.max(0, Math.round(st.acc)));
    if (watchMs >= 1000 || st.completed) mutateRef.current({ postId, data: { watchMs, completed: st.completed } });
    s.current = { acc: 0, since: null, completed: false };
  }, [postId]);
  const setPlaying = useCallback((playing: boolean) => {
    const st = s.current;
    if (playing && st.since === null) st.since = Date.now();
    else if (!playing && st.since !== null) { st.acc += Date.now() - st.since; st.since = null; }
  }, []);
  const markCompleted = useCallback(() => { s.current.completed = true; }, []);
  useEffect(() => { if (!active) flush(); }, [active, flush]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => { if (next !== 'active') flush(); });
    return () => { sub.remove(); flush(); };
  }, [flush]);
  return { setPlaying, markCompleted };
}

type Base = { feed?: GetVideosFeed; creatorId?: string };
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
    setState(s => {
      if (s.key !== baseKey || (s.before ?? null) !== (params.before ?? null)) return s;
      if (!s.before) return { ...s, items: page };
      const seen = new Set(s.items.map(p => p.id));
      return { ...s, items: [...s.items, ...page.filter(p => !seen.has(p.id))] };
    });
  }, [query.data, baseKey, params.before]);
  const cursor = query.data?.nextBefore ?? null;
  const loadNext = useCallback(() => {
    if (cursor && !query.isFetching) setState(s => s.before === cursor ? s : { ...s, before: cursor });
  }, [cursor, query.isFetching]);
  const refresh = useCallback(() => {
    setState({ key: baseKey, items: [] });
    void queryClient.invalidateQueries({ queryKey: getGetVideosQueryKey() });
  }, [baseKey, queryClient]);
  return {
    items: state.key === baseKey ? state.items : [],
    isLoading: query.isLoading, isError: query.isError, error: query.error, isFetching: query.isFetching,
    loadingMore: query.isFetching && !!before, hasMore: !!cursor, loadNext, refresh, retry: () => void query.refetch(),
  };
}
