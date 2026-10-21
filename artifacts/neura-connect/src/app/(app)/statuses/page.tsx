"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleDashed, ChevronLeft, ChevronRight, Hourglass, Loader2, Plus, X } from "lucide-react";
import { useCreateStatus, type Status, type MediaAttachment } from "@workspace/api-client-react";
import { MediaPicker, MediaPreview } from "@/components/media-attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { StatusRing, useActiveStatuses } from "@/components/status/status-ring";
import { useToast } from "@/hooks/use-toast";
import { errMessage, relTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate } from "@/lib/realtime";

const STORY_DURATION = 5000;

const backgrounds = [
  { key: "midnight", label: "Midnight", css: "linear-gradient(145deg, #14243f 0%, #334e79 100%)" },
  { key: "sunset", label: "Sunset", css: "linear-gradient(145deg, #a93d5d 0%, #ed875e 100%)" },
  { key: "berry", label: "Berry", css: "linear-gradient(145deg, #59265e 0%, #ad4b83 100%)" },
  { key: "ocean", label: "Ocean", css: "linear-gradient(145deg, #075a70 0%, #37a6a2 100%)" },
  { key: "aurora", label: "Aurora", css: "linear-gradient(145deg, #254d54 0%, #59866b 55%, #a2a268 100%)" },
  { key: "coral", label: "Coral", css: "linear-gradient(145deg, #b94b54 0%, #ed9c72 100%)" },
  { key: "forest", label: "Forest", css: "linear-gradient(145deg, #1f493c 0%, #5b8062 100%)" },
  { key: "plum", label: "Plum", css: "linear-gradient(145deg, #46345f 0%, #876a9c 100%)" },
] as const;

type BackgroundKey = (typeof backgrounds)[number]["key"];

function backgroundFor(key: string) {
  return backgrounds.find((item) => item.key === key)?.css ?? backgrounds[0].css;
}

function hoursLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expiring";
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h left` : `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

function lifePct(status: Status) {
  const total = new Date(status.expiresAt).getTime() - new Date(status.createdAt).getTime();
  return total > 0 ? Math.max(0, Math.min(1, (new Date(status.expiresAt).getTime() - Date.now()) / total)) : 0;
}

export default function StatusesPage() {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<MediaAttachment>();
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundKey>("midnight");
  const [viewing, setViewing] = useState<Status[] | null>(null);
  const [requestedAuthorId, setRequestedAuthorId] = useState<string | null>(null);
  const openedAuthorId = useRef<string | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const list = useActiveStatuses();
  const create = useCreateStatus({
    mutation: {
      onSuccess: () => {
        setText("");
        setAttachment(undefined);
        setBackgroundStyle("midnight");
        invalidate("/api/statuses");
        toast({ title: "Your status is live", description: "Friends can see it for the next 24 hours." });
      },
      onError: (error) => toast({ title: "Couldn't post status", description: errMessage(error), variant: "destructive" }),
    },
  });

  const ownStatuses = useMemo(() => list.active
    .filter((status) => status.author.id === me.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [list.active, me.id]);

  const current = viewing?.[storyIndex];

  function openStories(statuses: Status[]) {
    setStoryIndex(0);
    setElapsed(0);
    setViewing(statuses);
  }

  useEffect(() => {
    const authorId = new URLSearchParams(window.location.search).get("authorId");
    if (authorId) setRequestedAuthorId(authorId);
  }, []);

  useEffect(() => {
    if (!requestedAuthorId || !list.data || openedAuthorId.current === requestedAuthorId) return;
    openedAuthorId.current = requestedAuthorId;
    const contactStatuses = list.active
      .filter((status) => status.author.id === requestedAuthorId && status.author.id !== me.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (contactStatuses.length) {
      setViewing(contactStatuses);
      setStoryIndex(0);
      setElapsed(0);
    } else {
      toast({ title: "Status unavailable", description: "Only active statuses from mutual contacts can be viewed here." });
      const url = new URL(window.location.href);
      url.searchParams.delete("authorId");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setRequestedAuthorId(null);
  }, [requestedAuthorId, list.data, list.active, me.id, toast]);

  function closeStories() {
    setViewing(null);
    setStoryIndex(0);
    setElapsed(0);
    setRequestedAuthorId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("authorId")) {
      url.searchParams.delete("authorId");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function goNext() {
    if (!viewing) return;
    if (storyIndex + 1 >= viewing.length) closeStories();
    else {
      setStoryIndex((index) => index + 1);
      setElapsed(0);
    }
  }

  function goPrevious() {
    if (!viewing) return;
    if (storyIndex > 0) {
      setStoryIndex((index) => index - 1);
      setElapsed(0);
    }
  }

  useEffect(() => {
    if (!viewing) return;
    const timer = window.setInterval(() => setElapsed((value) => Math.min(STORY_DURATION, value + 50)), 50);
    return () => window.clearInterval(timer);
  }, [viewing, storyIndex]);

  useEffect(() => {
    if (elapsed >= STORY_DURATION && viewing) goNext();
  // goNext uses the current story group and index; elapsed is the timer boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, viewing]);

  useEffect(() => {
    if (!viewing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      } else if (event.key === "Escape") closeStories();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // The dialog is recreated when the story index changes, so listeners stay current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, storyIndex]);

  function postStatus() {
    const content = text.trim() || attachment?.name || "Shared a moment";
    create.mutate({
      data: {
        content,
        ...(attachment ? { mediaId: attachment.id } : { backgroundStyle }),
      },
    });
  }

  return (
    <PageScroll>
      <PageHeader kicker="Your personal status space" title="Your status" sub="Create and manage your own updates. Shared with mutual contacts for 24 hours." />

      <section className="rise mt-6 overflow-hidden rounded-[1.7rem] border border-border/70 bg-card shadow-sm" aria-labelledby="status-compose-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <UserAvatar id={me.id} name={me.name} src={me.avatarUrl} />
            <div>
              <h2 id="status-compose-heading" className="font-semibold">Your moment</h2>
              <p className="text-xs text-muted-foreground">A fresh update, just for today</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <Hourglass className="h-3.5 w-3.5" aria-hidden="true" /> Expires in 24 hours
          </span>
        </div>

        <div className="p-4 sm:p-5">
          {attachment ? (
            <div className="space-y-3">
              <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-[1.3rem] bg-[hsl(var(--ink))] p-3">
                <MediaPreview media={attachment} />
              </div>
              <Textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={500} rows={2}
                placeholder="Add a caption…"
                className="resize-none rounded-xl bg-muted/60 text-foreground placeholder:text-muted-foreground"
                aria-label="Add a status caption" data-testid="input-status" />
            </div>
          ) : (
            <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-[1.3rem] p-5 transition-colors sm:min-h-44"
              style={{ background: backgroundFor(backgroundStyle) }}>
              <Textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={500} rows={3}
                placeholder="What would you like people to know?"
                className="min-h-28 resize-none border-0 bg-transparent text-center font-display text-xl font-semibold leading-snug text-white shadow-none placeholder:text-white/70 focus-visible:ring-0 sm:text-2xl"
                aria-label="Write a text status" data-testid="input-status" />
              <span className="absolute bottom-3 right-4 font-mono text-[11px] text-white/75" aria-live="polite">{text.length}/500</span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {!attachment ? (
                <div className="flex items-center gap-2" role="group" aria-label="Choose a text status background">
                  <span className="text-xs font-medium text-muted-foreground">Background</span>
                  <div className="flex flex-wrap gap-1.5">
                    {backgrounds.map((background) => (
                      <button key={background.key} type="button" onClick={() => setBackgroundStyle(background.key)}
                        aria-label={`${background.label} background`} aria-pressed={backgroundStyle === background.key}
                        className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${backgroundStyle === background.key ? "border-foreground scale-110" : "border-card"}`}
                        style={{ background: background.css }} data-testid={`button-status-background-${background.key}`} />
                    ))}
                  </div>
                </div>
              ) : <p className="text-xs text-muted-foreground">Text backgrounds are for text-only updates.</p>}
              <MediaPicker purpose="status" value={attachment} onChange={setAttachment} />
            </div>
            <Button className="rounded-full px-5" disabled={(!text.trim() && !attachment) || create.isPending} onClick={postStatus} data-testid="button-post-status">
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              Share for 24h
            </Button>
          </div>
          {attachment ? <p className="mt-3 text-xs text-muted-foreground">Your photo or video will be shared with this update.</p> : null}
        </div>
      </section>

      <section className="mt-9" aria-labelledby="recent-statuses-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Only your updates</p>
            <h2 id="recent-statuses-heading" className="mt-1 font-display text-2xl font-semibold">Your status updates</h2>
          </div>
          {ownStatuses.length ? <span className="text-xs text-muted-foreground">{ownStatuses.length} active {ownStatuses.length === 1 ? "update" : "updates"}</span> : null}
        </div>
        {list.isLoading ? <CardSkeleton count={2} /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
        {list.data && ownStatuses.length === 0 ? <EmptyState icon={CircleDashed} title="Your status is clear" body="Your active updates will appear here, one card per post." /> : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {ownStatuses.map((status, index) => {
            const pct = lifePct(status);
            return (
              <li key={status.id} className="rise" style={{ animationDelay: `${index * 45}ms` }}>
                <button type="button" onClick={() => openStories([status])}
                  aria-label={`View your status posted ${relTime(status.createdAt)}`}
                  className="group flex w-full items-center gap-4 rounded-[1.35rem] border border-border/70 bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`button-status-${status.id}`}>
                  <StatusRing active>
                    <UserAvatar id={me.id} name={me.name} src={me.avatarUrl} size="lg" />
                  </StatusRing>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">You · {relTime(status.createdAt)}</span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">24h</span>
                    </span>
                    <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">{status.content}</span>
                    <span className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"><span className="rounded-full bg-[hsl(214_90%_58%/.12)] px-1.5 py-0.5 font-semibold uppercase tracking-wider text-[hsl(214_80%_45%)]">Active</span><Hourglass className="h-3 w-3" aria-hidden="true" />{hoursLeft(status.expiresAt)}</span>
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-gradient-to-r from-[hsl(188_92%_52%)] to-[hsl(262_80%_64%)]" style={{ width: `${pct * 100}%` }} /></span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && closeStories()}>
        <DialogContent aria-describedby="story-description" className="max-w-md overflow-hidden rounded-[1.7rem] border border-white/10 bg-[hsl(var(--ink))] p-0 text-white shadow-2xl [&>button]:hidden">
          {current && viewing ? (
            <div className="relative flex min-h-[min(78dvh,680px)] flex-col overflow-hidden" style={{ background: current.media ? "#14182a" : backgroundFor(current.backgroundStyle) }}>
              <DialogTitle className="sr-only">{current.author.id === me.id ? "Your status" : `${current.author.name}'s status`}</DialogTitle>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(7,10,23,.45)_100%)]" aria-hidden="true" />
              <div className="relative z-10 space-y-1 px-4 pt-4" aria-label={`Status ${storyIndex + 1} of ${viewing.length}`}>
                <div className="flex gap-1" aria-hidden="true">
                  {viewing.map((status, index) => (
                    <span key={status.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                      <span className="block h-full rounded-full bg-white" style={{
                        width: index < storyIndex ? "100%" : index === storyIndex ? `${Math.min(100, (elapsed / STORY_DURATION) * 100)}%` : "0%",
                        transition: index === storyIndex ? "width 50ms linear" : "none",
                      }} />
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-3">
                  <UserAvatar id={current.author.id} name={current.author.name} src={current.author.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{current.author.id === me.id ? "You" : current.author.name}</p>
                    <p className="text-xs text-white/65">{relTime(current.createdAt)}</p>
                  </div>
                  <span className="sr-only" id="story-description">{`Status ${storyIndex + 1} of ${viewing.length}. Advances automatically after five seconds.`}</span>
                  <button type="button" onClick={closeStories} aria-label="Close status viewer" className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" data-testid="button-close-status-viewer">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <button type="button" aria-label="Previous status" onClick={goPrevious} disabled={storyIndex === 0}
                className="absolute inset-y-20 left-0 z-20 flex w-12 items-center justify-center text-white/70 transition hover:text-white disabled:cursor-default disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                data-testid="button-previous-status"><ChevronLeft className="h-7 w-7" /></button>
              <button type="button" aria-label="Next status" onClick={goNext}
                className="absolute inset-y-20 right-0 z-20 flex w-12 items-center justify-center text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                data-testid="button-next-status"><ChevronRight className="h-7 w-7" /></button>

              <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-12 py-8 text-center">
                {current.media ? <div className="mb-5 flex max-h-[46vh] justify-center [&_img]:max-h-[46vh] [&_video]:max-h-[46vh]"><MediaPreview media={current.media} /></div> : null}
                <p className="max-h-[30vh] overflow-y-auto whitespace-pre-wrap break-words font-display text-3xl font-semibold leading-tight sm:text-4xl">{current.content}</p>
              </div>
              <div className="relative z-10 flex items-center justify-between px-5 pb-5 text-xs text-white/65">
                <span>{hoursLeft(current.expiresAt)}</span>
                <span className="font-mono">Tap arrows or use ← →</span>
              </div>
              <span className="sr-only" aria-live="polite">{`Status ${storyIndex + 1} of ${viewing.length}`}</span>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageScroll>
  );
}
