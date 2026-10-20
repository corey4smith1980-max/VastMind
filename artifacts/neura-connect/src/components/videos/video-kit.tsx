"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/vastmind-auth";
import { useRecordVideoEngagement, type CaptionCue, type MediaAttachment, type Post } from "@workspace/api-client-react";
export { usePagedSocialTimeline as usePagedVideos } from "@workspace/api-client-react";

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

/** Fetch only a short-lived read URL here; video elements can then request byte ranges directly. */
export function useVideoPlayback(media: MediaAttachment | null | undefined, enabled = true) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ id: string; url: string | null; error: boolean } | null>(null);
  const id = media?.id, mediaUrl = media?.url;
  useEffect(() => {
    if (!id || !mediaUrl || !enabled || !isLoaded || !isSignedIn) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState({ id, url: null, error: false });
    const load = async () => {
      try {
        const token = await getToken();
        const endpoint = new URL(mediaUrl, window.location.origin);
        if (endpoint.origin !== window.location.origin) throw new Error("Invalid media origin.");
        endpoint.searchParams.set("playback", "1");
        // VastMind passkeys authenticate through an HttpOnly same-origin cookie;
        // only the temporary legacy Clerk bridge supplies a bearer token.
        const response = await fetch(endpoint, {
          credentials: "same-origin",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Video access expired. Try refreshing.");
        const body = await response.json() as { url?: unknown; expiresAt?: unknown };
        if (typeof body.url !== "string" || typeof body.expiresAt !== "number") {
          throw new Error("Video is temporarily unavailable.");
        }
        const playbackUrl = new URL(body.url, endpoint.origin);
        if (playbackUrl.protocol !== "https:" || playbackUrl.origin !== endpoint.origin) {
          throw new Error("Video is temporarily unavailable.");
        }
        if (!alive) return;
        setState({ id, url: playbackUrl.toString(), error: false });
        const renewIn = Math.max(30_000, Math.min(13 * 60_000, body.expiresAt - Date.now() - 60_000));
        timer = setTimeout(() => { if (alive) void load(); }, renewIn);
      } catch {
        if (alive) setState({ id, url: null, error: true });
      }
    };
    void load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [id, mediaUrl, enabled, isLoaded, isSignedIn, getToken, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const current = state?.id === id ? state : null;
  return { url: current?.url ?? null, error: !!current?.error, retry };
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

