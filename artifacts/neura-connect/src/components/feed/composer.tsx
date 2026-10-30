"use client";
import { useState } from "react";
import { BarChart3, Loader2, Plus, Trash2, X } from "lucide-react";
import { useCreatePost, type MediaAttachment } from "@workspace/api-client-react";
import { MediaPicker } from "@/components/media-attachment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate } from "@/lib/realtime";

// ---------- Post / poll composer ----------
export function Composer({ onPublished, surface = "community" }: { onPublished?: () => void; surface?: "community" | "profile" }) {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [photo, setPhoto] = useState<MediaAttachment>();
  const [uploading, setUploading] = useState(false);

  const create = useCreatePost({
    mutation: {
      onSuccess: () => {
        invalidate("/api/feed", "/api/videos");
        onPublished?.();
        setContent(""); setPoll(null); setAnonymous(false); setPhoto(undefined);
        toast({ title: "Posted" });
      },
      onError: (e) => toast({ title: "Couldn't post", description: errMessage(e), variant: "destructive" }),
    },
  });

  const opts = (poll ?? []).map((o) => o.trim()).filter(Boolean);
  const distinct = new Set(opts.map((o) => o.toLowerCase())).size === opts.length;
  const pollValid = poll === null || (opts.length >= 2 && distinct && content.trim().length > 0);
  const hasBody = poll ? content.trim().length > 0 : content.trim().length > 0 || !!photo;
  const canPost = hasBody && pollValid && !create.isPending && !uploading;
  const hint = uploading ? "Wait for the photo to finish uploading." : poll && !content.trim() ? "Polls need a question." : poll && opts.length < 2 ? "Add at least two options." : poll && !distinct ? "Poll options must be different." : null;

  return (
    <div className="rise rounded-[1.6rem] border bg-card p-4 sm:p-5">
      <div className="flex gap-3">
        <UserAvatar id={me.id} name={me.name} src={me.avatarUrl} size="md" />
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} rows={3}
          placeholder={poll ? "Ask a question…" : photo ? "Add a caption (optional)" : "What's on your mind?"} aria-label="Post content"
          className="min-h-[72px] resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" data-testid="input-post-content" />
      </div>
      {photo ? (
        <figure className="rise relative mt-3 overflow-hidden rounded-2xl border bg-muted sm:ml-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={`Selected photo: ${photo.name}`} className="max-h-72 w-full object-contain" />
          <figcaption className="flex items-center justify-between gap-2 border-t bg-card/90 px-3 py-1.5 text-xs">
            <span className="truncate text-muted-foreground">{photo.name}</span>
            <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full text-destructive" disabled={create.isPending} onClick={() => setPhoto(undefined)} aria-label="Remove photo" data-testid="button-remove-post-photo"><Trash2 className="mr-1 h-3.5 w-3.5" />Remove</Button>
          </figcaption>
        </figure>
      ) : null}
      {uploading ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground sm:ml-14"><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading photo — publishing unlocks when it's done.</p> : null}
      {poll ? (
        <div className="rise mt-3 space-y-2 pl-14">
          {poll.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input value={o} maxLength={120} onChange={(e) => setPoll((p) => p!.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} aria-label={`Poll option ${i + 1}`} className="rounded-xl" data-testid={`input-poll-option-${i}`} />
              {poll.length > 2 ? <Button size="icon" variant="ghost" onClick={() => setPoll((p) => p!.filter((_, j) => j !== i))} aria-label="Remove option"><X className="h-4 w-4" /></Button> : null}
            </div>
          ))}
          {poll.length < 6 ? <Button size="sm" variant="ghost" onClick={() => setPoll((p) => [...p!, ""])}><Plus className="mr-1 h-3.5 w-3.5" /> Add option</Button> : null}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" variant={poll ? "secondary" : "ghost"} className="rounded-full" onClick={() => setPoll((p) => (p ? null : ["", ""]))} data-testid="button-toggle-poll">
          <BarChart3 className="mr-1 h-4 w-4" /> {poll ? "Remove poll" : "Poll"}
        </Button>
        <MediaPicker purpose="post" imagesOnly hideValue value={photo} onChange={setPhoto} onUploadingChange={setUploading} disabled={create.isPending} label={photo ? "Replace photo" : "Photo"} />
        <label className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
          <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} aria-label="Post anonymously" data-testid="toggle-anonymous-post" />
          <span>Post anonymously</span>
        </label>
        <Button className="ml-auto rounded-full px-5" disabled={!canPost}
          onClick={() => create.mutate({ data: { content: content.trim(), surface, pollOptions: poll ? opts : undefined, mediaId: photo?.id, isAnonymous: anonymous } })} data-testid="button-publish-post">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Post
        </Button>
      </div>
      {hint ? <p className="mt-2 text-right text-xs text-muted-foreground" aria-live="polite">{hint}</p> : null}
    </div>
  );
}
