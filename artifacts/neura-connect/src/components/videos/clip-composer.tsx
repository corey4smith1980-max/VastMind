"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Film, Loader2, Music2, Upload, Video, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetVideosQueryKey, useCompleteMediaUpload, useCreatePost, useRequestUploadUrl, type PostEffect, type VideoPage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_BYTES = 25 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const EFFECTS: { id: PostEffect; label: string; note: string }[] = [
  { id: "none", label: "Original", note: "true to life" },
  { id: "warm", label: "Warm", note: "soft amber" },
  { id: "soft", label: "Soft", note: "gentle light" },
  { id: "mono", label: "Mono", note: "black & white" },
];

async function uploadFile(file: File, getTicket: (input: { data: { name: string; size: number; contentType: string; purpose: "post" } }) => Promise<{ id: string; uploadUrl: string }>, complete: (id: string) => Promise<{ id: string }>) {
  const contentType = file.type || "application/octet-stream";
  const ticket = await getTicket({ data: { name: file.name, size: file.size, contentType, purpose: "post" } });
  const response = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!response.ok) throw new Error("The upload did not finish. Please try again.");
  return complete(ticket.id);
}

export function ClipComposer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [effect, setEffect] = useState<PostEffect>("none");
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const ticket = useRequestUploadUrl();
  const complete = useCompleteMediaUpload();
  const create = useCreatePost();

  useEffect(() => {
    if (!videoFile) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(videoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  const selectVideo = async (file?: File) => {
    if (!file) return;
    if (!VIDEO_TYPES.includes(file.type)) {
      toast({ title: "Choose an MP4, WebM or MOV clip", variant: "destructive" }); return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "This clip is over 25 MB", description: "Choose a smaller video to keep uploads quick.", variant: "destructive" }); return;
    }
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (probe.duration > 90) {
        toast({ title: "Keep clips under 90 seconds", variant: "destructive" });
        setVideoFile(null);
      } else setVideoFile(file);
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setVideoFile(file); };
    probe.src = url;
  };
  const selectAudio = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("audio/") || file.size > MAX_BYTES) {
      toast({ title: "Choose an audio track under 25 MB", variant: "destructive" }); return;
    }
    setAudioFile(file);
  };
  const publish = async () => {
    if (!videoFile || !caption.trim() || busy) return;
    setBusy(true);
    try {
      const media = await uploadFile(videoFile, (input) => ticket.mutateAsync(input), (id) => complete.mutateAsync({ mediaId: id }));
      let audioMediaId: string | undefined;
      if (audioFile) {
        const audio = await uploadFile(audioFile, (input) => ticket.mutateAsync(input), (id) => complete.mutateAsync({ mediaId: id }));
        audioMediaId = audio.id;
      }
      const post = await create.mutateAsync({ data: { content: caption.trim(), mediaId: media.id, ...(audioMediaId ? { audioMediaId } : {}), effect } });
      queryClient.setQueryData<VideoPage>(getGetVideosQueryKey(), (old) => ({
        items: [post, ...(old?.items ?? []).filter((item) => item.id !== post.id)],
        nextBefore: old?.nextBefore ?? null,
      }));
      void queryClient.invalidateQueries({ queryKey: getGetVideosQueryKey() });
      toast({ title: "Your clip is live" });
      router.refresh();
      onClose();
    } catch (error) {
      toast({ title: "Couldn't publish your clip", description: errMessage(error), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[hsl(192_52%_10%/.68)] p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="clip-composer-title">
      <div className="relative grid max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-card text-card-foreground shadow-2xl md:grid-cols-[.9fr_1.1fr]">
        <div className="relative flex min-h-[260px] items-center justify-center bg-[hsl(192_50%_12%)] p-5 text-center text-white md:min-h-[620px]">
          {videoFile ? <video src={previewUrl} className="absolute inset-0 h-full w-full object-contain" controls muted playsInline /> : (
            <div className="max-w-[250px]">
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-white/20 bg-white/10"><Film className="h-7 w-7" /></div>
              <p className="font-display text-2xl">A small moment, well told.</p>
              <p className="mt-2 text-sm text-white/65">Portrait or landscape. Up to 90 seconds and 25 MB.</p>
              <Button onClick={() => videoRef.current?.click()} className="mt-6 rounded-full" data-testid="button-select-video"><Upload className="mr-2 h-4 w-4" /> Choose a clip</Button>
            </div>
          )}
          <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment" className="sr-only" aria-label="Choose or record a video clip" onChange={(e) => { void selectVideo(e.target.files?.[0]); e.currentTarget.value = ""; }} data-testid="input-clip-video" />
          {videoFile ? <Button variant="secondary" size="sm" className="absolute bottom-4 left-4 rounded-full" onClick={() => videoRef.current?.click()}><Video className="mr-2 h-4 w-4" /> Replace</Button> : null}
          <span className="absolute left-5 top-5 font-mono text-[10px] uppercase tracking-[.22em] text-white/55">Make a clip</span>
        </div>
        <section className="p-5 sm:p-8">
          <div className="flex items-start justify-between">
            <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Your point of view</p><h2 id="clip-composer-title" className="mt-2 font-display text-3xl">Create a moment</h2></div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close clip composer" data-testid="button-close-clip-composer"><X className="h-5 w-5" /></Button>
          </div>
          <label className="mt-7 block text-sm font-semibold" htmlFor="clip-caption">Caption <span className="font-normal text-muted-foreground">· your words only</span></label>
          <Textarea id="clip-caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={5000} rows={4} placeholder="What did you make, learn, or notice?" className="mt-2 resize-none rounded-2xl bg-background" data-testid="input-clip-caption" />
          <div className="mt-6">
            <p className="text-sm font-semibold">A little treatment</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {EFFECTS.map((item) => (
                <button type="button" key={item.id} aria-pressed={effect === item.id} onClick={() => setEffect(item.id)} className={cn("flex items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors", effect === item.id ? "border-primary bg-primary/5" : "hover:bg-muted")} data-testid={`button-effect-${item.id}`}>
                  <span><span className="block text-sm font-semibold">{item.label}</span><span className="text-xs text-muted-foreground">{item.note}</span></span>
                  {effect === item.id ? <Check className="h-4 w-4 text-primary" /> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <p className="text-sm font-semibold">Sound, if it belongs</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Add an audio track you have rights to use. No bundled music or outside sound.</p>
            <input ref={audioRef} type="file" accept="audio/*" className="sr-only" aria-label="Choose your audio track" onChange={(e) => { selectAudio(e.target.files?.[0]); e.currentTarget.value = ""; }} data-testid="input-clip-audio" />
            <Button variant="outline" onClick={() => audioRef.current?.click()} className="mt-3 max-w-full rounded-full" data-testid="button-select-audio"><Music2 className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">{audioFile ? audioFile.name : "Add your own audio track"}</span></Button>
            {audioFile ? <button onClick={() => setAudioFile(null)} className="ml-2 rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Remove audio track"><X className="h-4 w-4" /></button> : null}
          </div>
          <div className="mt-8 flex items-center justify-between border-t pt-5">
            <p className="text-xs text-muted-foreground">{caption.length}/5000 characters</p>
            <Button onClick={() => void publish()} disabled={!videoFile || !caption.trim() || busy} className="rounded-full px-6" data-testid="button-publish-clip">
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading</> : "Share clip"}
            </Button>
          </div>
          {busy ? <p role="status" className="mt-3 text-center text-xs text-muted-foreground">Uploading securely. Keep this window open for a moment.</p> : null}
        </section>
      </div>
    </div>
  );
}
