"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Captions, Check, Circle, Film, FlipHorizontal, Loader2, Music2, Plus, Square, Trash2, Upload, Wand2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetVideosQueryKey, useCompleteMediaUpload, useCreatePost, useGetVideoCapabilities, useRenderVideo, useRequestUploadUrl, useTranscribeVideo,
  type CaptionCue, type MediaAttachment, type PostEffect, type RenderVideoBodyAspect, type RenderVideoBodySpeed,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useVideoPlayback } from "@/components/videos/video-kit";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_SECONDS = 90;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const EFFECTS: { id: PostEffect; label: string }[] = [{ id: "none", label: "Original" }, { id: "warm", label: "Warm" }, { id: "soft", label: "Soft" }, { id: "mono", label: "Mono" }];
const SPEEDS: RenderVideoBodySpeed[] = [0.5, 1, 1.5, 2];
const ASPECTS: { id: RenderVideoBodyAspect; label: string }[] = [{ id: "original", label: "As shot" }, { id: "portrait", label: "Portrait 9:16" }, { id: "square", label: "Square 1:1" }];
const previewEffect = { none: "", warm: "sepia-[.2] saturate-[1.15]", mono: "grayscale", soft: "brightness-[1.06] saturate-[.82]" };

type Ticket = (input: { data: { name: string; size: number; contentType: string; purpose: "post" } }) => Promise<{ id: string; uploadUrl: string }>;
async function uploadFile(file: File, getTicket: Ticket, complete: (id: string) => Promise<MediaAttachment>) {
  const contentType = (file.type || "application/octet-stream").split(";")[0];
  const ticket = await getTicket({ data: { name: file.name.slice(0, 150), size: file.size, contentType, purpose: "post" } });
  const response = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!response.ok) throw new Error("The upload did not finish. Please try again.");
  return complete(ticket.id);
}
function pickRecorderType() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ClipComposer({ onClose }: { onClose: (published?: boolean) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const caps = useGetVideoCapabilities();
  const ticket = useRequestUploadUrl();
  const complete = useCompleteMediaUpload();
  const render = useRenderVideo();
  const transcribe = useTranscribeVideo();
  const create = useCreatePost();

  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);

  const [mode, setMode] = useState<"pick" | "camera">("pick");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cameraNote, setCameraNote] = useState("");
  const [source, setSource] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [speed, setSpeed] = useState<RenderVideoBodySpeed>(1);
  const [aspect, setAspect] = useState<RenderVideoBodyAspect>("original");
  const [mirror, setMirror] = useState(false);
  const [effect, setEffect] = useState<PostEffect>("none");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [rightsOk, setRightsOk] = useState(false);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [musicVolume, setMusicVolume] = useState(0.6);
  const [uploaded, setUploaded] = useState<{ file: File; media: MediaAttachment } | null>(null);
  const [uploadedAudio, setUploadedAudio] = useState<{ file: File; media: MediaAttachment } | null>(null);
  const [rendered, setRendered] = useState<{ sig: string; media: MediaAttachment; duration: number } | null>(null);
  const [cues, setCues] = useState<CaptionCue[]>([]);
  const [aiConsent, setAiConsent] = useState(false);
  const [caption, setCaption] = useState("");
  const [stage, setStage] = useState<"" | "uploading" | "rendering" | "transcribing" | "publishing">("");
  const [stageError, setStageError] = useState("");
  const [view, setView] = useState<"source" | "result">("source");
  const renderedPlayback = useVideoPlayback(rendered?.media, mode === "pick" && view === "result");

  const canRender = caps.data?.rendering === true;
  const canTranscribe = caps.data?.transcription === true;
  const sig = useMemo(() => JSON.stringify({ src: source ? `${source.name}:${source.size}:${source.lastModified}` : "", start, end, speed, aspect, mirror, effect, audio: audioFile ? `${audioFile.name}:${audioFile.size}` : "", ov: originalVolume, mv: audioFile ? musicVolume : 0 }), [source, start, end, speed, aspect, mirror, effect, audioFile, originalVolume, musicVolume]);
  const fresh = !!rendered && rendered.sig === sig;
  const busy = stage !== "";

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveRef.current) liveRef.current.srcObject = null;
  }, []);
  const clearTimer = () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };

  useEffect(() => () => {
    discardRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (!source) { setSourceUrl(""); return; }
    const url = URL.createObjectURL(source);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  useEffect(() => { if (mode === "camera" && liveRef.current && streamRef.current) liveRef.current.srcObject = streamRef.current; }, [mode]);

  const acceptSource = (file: File, knownDuration?: number) => {
    const finish = (d: number) => {
      if (d > MAX_SECONDS + 0.5) { toast({ title: "Keep clips under 90 seconds", variant: "destructive" }); return; }
      setSource(file); setDuration(d); setStart(0); setEnd(Math.min(d || MAX_SECONDS, MAX_SECONDS));
      setUploaded(null); setRendered(null); setCues([]); setView("source"); setStageError("");
    };
    if (knownDuration) { finish(knownDuration); return; }
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      // Recorded WebM often reports Infinity until seeked.
      if (!Number.isFinite(probe.duration)) { probe.currentTime = 1e6; probe.ontimeupdate = () => { probe.ontimeupdate = null; URL.revokeObjectURL(url); finish(probe.duration); }; return; }
      URL.revokeObjectURL(url); finish(probe.duration);
    };
    probe.onerror = () => { URL.revokeObjectURL(url); toast({ title: "This video can't be read", description: "Try an MP4 or WebM file.", variant: "destructive" }); };
    probe.src = url;
  };
  const selectFile = (file?: File) => {
    if (!file) return;
    if (!VIDEO_TYPES.includes(file.type)) { toast({ title: "Choose an MP4, WebM or MOV clip", variant: "destructive" }); return; }
    if (file.size > MAX_BYTES) { toast({ title: "This clip is over 25 MB", description: "Choose a shorter or smaller video.", variant: "destructive" }); return; }
    acceptSource(file);
  };

  const openCamera = async () => {
    setCameraNote("");
    if (!navigator.mediaDevices?.getUserMedia || pickRecorderType() === null) { setCameraNote("This browser can't record video here. Choose a file from your device instead."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true });
      streamRef.current = stream;
      setMode("camera");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setCameraNote(name === "NotAllowedError" ? "Camera access was declined. Allow it in your browser's site settings, or choose a file instead." : name === "NotFoundError" ? "No camera was found. Choose a file instead." : "The camera couldn't start. Choose a file instead.");
    }
  };
  const closeCamera = () => { if (recorderRef.current?.state === "recording") { discardRef.current = true; recorderRef.current.stop(); } clearTimer(); stopTracks(); setRecording(false); setMode("pick"); };
  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); clearTimer(); };
  const startRecording = () => {
    const stream = streamRef.current;
    const type = pickRecorderType();
    if (!stream || type === null) return;
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 1_800_000 });
    discardRef.current = false;
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const seconds = (performance.now() - began) / 1000;
      setRecording(false); stopTracks(); setMode("pick");
      if (discardRef.current) return;
      const mime = (recorder.mimeType || type || "video/webm").split(";")[0];
      const file = new File(chunks, `clip-${Date.now()}.${mime === "video/mp4" ? "mp4" : "webm"}`, { type: mime });
      if (file.size > MAX_BYTES) { toast({ title: "That take is over 25 MB", description: "Record a shorter take.", variant: "destructive" }); return; }
      acceptSource(file, Math.min(seconds, MAX_SECONDS));
    };
    const began = performance.now();
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true); setElapsed(0);
    timerRef.current = setInterval(() => {
      const s = (performance.now() - began) / 1000;
      setElapsed(s);
      if (s >= MAX_SECONDS) stopRecording();
    }, 250);
  };

  const selectAudio = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("audio/") || file.size > MAX_BYTES) { toast({ title: "Choose an audio file under 25 MB", variant: "destructive" }); return; }
    setAudioFile(file); setRightsOk(false); setUploadedAudio(null);
  };
  const doUpload = (file: File) => uploadFile(file, (input) => ticket.mutateAsync(input), (id) => complete.mutateAsync({ mediaId: id }));
  const ensureSource = async () => {
    if (!source) throw new Error("Choose or record a clip first.");
    if (uploaded?.file === source) return uploaded.media;
    setStage("uploading");
    const media = await doUpload(source);
    setUploaded({ file: source, media });
    return media;
  };
  const ensureAudio = async () => {
    if (!audioFile) return undefined;
    if (uploadedAudio?.file === audioFile) return uploadedAudio.media;
    setStage("uploading");
    const media = await doUpload(audioFile);
    setUploadedAudio({ file: audioFile, media });
    return media;
  };

  const runRender = async () => {
    if (!source || busy || !canRender) return;
    if (audioFile && !rightsOk) { setStageError("Confirm you have the rights to use this music first."); return; }
    setStageError("");
    try {
      const media = await ensureSource();
      const audio = await ensureAudio();
      setStage("rendering");
      const renderSig = sig;
      const result = await render.mutateAsync({ data: { mediaId: media.id, start: Number(start.toFixed(2)), end: Number(end.toFixed(2)), speed, aspect, mirror, effect, originalVolume, ...(audio ? { audioMediaId: audio.id, musicVolume } : {}) } });
      setRendered({ sig: renderSig, media: result.media, duration: result.durationSeconds });
      setCues([]);
      setView("result");
    } catch (e) { setStageError(errMessage(e)); }
    finally { setStage(""); }
  };

  const transcribeTarget = canRender ? (fresh ? rendered!.media.id : null) : uploaded?.media.id ?? null;
  const runTranscribe = async () => {
    if (!aiConsent || busy || !canTranscribe) return;
    setStageError("");
    try {
      let target = transcribeTarget;
      if (!target && !canRender) target = (await ensureSource()).id;
      if (!target) throw new Error("Render your preview first so captions match the final clip.");
      setStage("transcribing");
      const result = await transcribe.mutateAsync({ data: { mediaId: target } });
      setCues(result.captions);
      if (!result.captions.length) toast({ title: "No speech found", description: "Add captions by hand if you'd like." });
    } catch (e) { setStageError(errMessage(e)); }
    finally { setStage(""); }
  };

  const outputLength = fresh ? rendered!.duration : Math.max(0.1, (end - start) / speed);
  const cleanCues = cues.map((c) => ({ start: Math.max(0, Math.min(90, Number(c.start) || 0)), end: Math.max(0, Math.min(90, Number(c.end) || 0)), text: c.text.trim().slice(0, 500) })).filter((c) => c.text && c.end > c.start).slice(0, 60);
  const cueProblem = cues.some((c) => c.text.trim() && !(Number(c.end) > Number(c.start)));
  const needsRender = canRender && !fresh;
  const canPublish = !!source && !!caption.trim() && !busy && !needsRender && !cueProblem && (!audioFile || rightsOk);

  const publish = async () => {
    if (!canPublish) return;
    setStageError("");
    try {
      let mediaId: string, extra: { effect: PostEffect; audioMediaId?: string };
      if (canRender && rendered) { mediaId = rendered.media.id; extra = { effect: "none" }; }
      else {
        // Rendering unavailable: publish the untouched source; look and own soundtrack play alongside, as before.
        mediaId = (await ensureSource()).id;
        const audio = await ensureAudio();
        extra = { effect, ...(audio ? { audioMediaId: audio.id } : {}) };
      }
      setStage("publishing");
      await create.mutateAsync({ data: { content: caption.trim(), surface: "feed", mediaId, ...extra, ...(cleanCues.length ? { captions: cleanCues } : {}) } });
      void queryClient.invalidateQueries({ queryKey: getGetVideosQueryKey() });
      toast({ title: "Your clip is live" });
      onClose(true);
    } catch (e) { setStageError(errMessage(e)); }
    finally { setStage(""); }
  };

  const disabledReason = caps.isLoading ? "Checking which editing tools are available" : caps.isError ? "Editing tools couldn't be checked, so your clip will be shared as recorded." : !canRender ? "Editing isn't available on this server right now. Your clip will be shared as recorded, with the look applied during playback." : "";
  const stageText = { uploading: "Uploading securely", rendering: "Rendering your edit", transcribing: "Listening for captions", publishing: "Publishing" } as const;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[hsl(192_52%_10%/.68)] p-2 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="clip-composer-title">
      <div className="relative grid max-h-[96dvh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-card text-card-foreground shadow-2xl md:grid-cols-[.85fr_1.15fr]">
        <div className="relative flex min-h-[340px] flex-col bg-[hsl(192_50%_12%)] text-white md:sticky md:top-0 md:max-h-[96dvh] md:min-h-[640px]">
          <div className="flex items-center justify-between px-5 pt-5"><span className="font-mono text-[10px] uppercase tracking-[.22em] text-white/55">Make a clip</span>
            {source && mode === "pick" ? <div role="tablist" aria-label="Preview" className="flex rounded-full bg-white/10 p-0.5 text-[11px]">
              <button role="tab" aria-selected={view === "source"} onClick={() => setView("source")} className={cn("rounded-full px-3 py-1", view === "source" && "bg-white text-[hsl(192_52%_12%)]")}>Source</button>
              <button role="tab" aria-selected={view === "result"} disabled={!rendered} onClick={() => setView("result")} className={cn("rounded-full px-3 py-1 disabled:opacity-40", view === "result" && "bg-white text-[hsl(192_52%_12%)]")}>Rendered</button>
            </div> : null}
          </div>
          <div className="relative m-4 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black/30">
            {mode === "camera" ? <>
              <video ref={liveRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full -scale-x-100 object-cover" aria-label="Camera preview" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent p-5">
                <span className={cn("font-mono text-sm tabular-nums", recording && "text-[hsl(12_82%_65%)]")} aria-live="polite">{fmt(elapsed)} / 1:30</span>
                {recording ? <button onClick={stopRecording} className="grid h-16 w-16 place-items-center rounded-full border-4 border-white" aria-label="Stop recording" data-testid="button-stop-recording"><Square className="h-6 w-6 fill-[hsl(12_82%_52%)] text-[hsl(12_82%_52%)]" /></button>
                  : <button onClick={startRecording} className="grid h-16 w-16 place-items-center rounded-full border-4 border-white" aria-label="Start recording" data-testid="button-start-recording"><Circle className="h-11 w-11 fill-[hsl(12_82%_52%)] text-[hsl(12_82%_52%)]" /></button>}
                <Button variant="secondary" size="sm" className="rounded-full" onClick={closeCamera}>Cancel</Button>
              </div>
            </> : source ? (view === "result" && rendered ? renderedPlayback.url ? <video key={rendered.media.id} src={renderedPlayback.url} controls playsInline className="absolute inset-0 h-full w-full object-contain" aria-label="Rendered preview" data-testid="video-rendered-preview" />
              : <p role={renderedPlayback.error ? "alert" : "status"} className="max-w-[260px] p-5 text-center text-white/80">{renderedPlayback.error ? "The preview couldn't load." : "Preparing your private preview…"}</p>
              : sourceUrl
                ? <video key={sourceUrl} src={sourceUrl} controls muted playsInline className={cn("absolute inset-0 h-full w-full object-contain", mirror && "-scale-x-100", previewEffect[effect])} aria-label="Source clip" onLoadedMetadata={(e) => { e.currentTarget.currentTime = start; }} />
                : <p role="status" className="flex items-center gap-2 p-5 text-sm text-white/75" data-testid="video-source-preview-loading"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Preparing your clip preview…</p>)
            : <div className="max-w-[270px] p-5 text-center">
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-white/20 bg-white/10"><Film className="h-7 w-7" /></div>
              <p className="font-display text-2xl">A small moment, well told.</p>
              <p className="mt-2 text-sm text-white/65">Record up to 90 seconds, or choose a clip under 25 MB.</p>
              <div className="mt-6 flex flex-col gap-2">
                <Button onClick={() => void openCamera()} className="rounded-full" data-testid="button-open-camera"><Camera className="mr-2 h-4 w-4" />Record with camera</Button>
                <Button onClick={() => fileRef.current?.click()} variant="secondary" className="rounded-full" data-testid="button-select-video"><Upload className="mr-2 h-4 w-4" />Choose a file</Button>
              </div>
              {cameraNote ? <p role="alert" className="mt-4 text-xs leading-relaxed text-[hsl(42_90%_70%)]">{cameraNote}</p> : null}
            </div>}
            {rendered && !fresh && view === "result" ? <span className="absolute left-3 top-3 rounded-full bg-[hsl(42_90%_60%)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(192_52%_12%)]">Out of date. Render again</span> : null}
          </div>
          {source && mode === "pick" ? <div className="flex gap-2 px-4 pb-4">
            <Button variant="secondary" size="sm" className="rounded-full" onClick={() => void openCamera()} disabled={busy}><Camera className="mr-1.5 h-4 w-4" />Re-record</Button>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="mr-1.5 h-4 w-4" />Replace</Button>
          </div> : null}
          <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" aria-label="Choose a video clip" onChange={(e) => { selectFile(e.target.files?.[0]); e.currentTarget.value = ""; }} data-testid="input-clip-video" />
        </div>

        <section className="p-5 sm:p-8">
          <div className="flex items-start justify-between">
            <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Your point of view</p><h2 id="clip-composer-title" className="mt-2 font-display text-3xl">Create a moment</h2></div>
            <Button variant="ghost" size="icon" onClick={() => onClose(false)} aria-label="Close clip composer" data-testid="button-close-clip-composer"><X className="h-5 w-5" /></Button>
          </div>

          <fieldset disabled={!source || !canRender || busy} className="mt-6 space-y-5 disabled:opacity-60">
            <legend className="text-sm font-semibold">Edit</legend>
            {disabledReason ? <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground" role="note">{disabledReason}</p> : null}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>Trim</span><span className="tabular-nums">{fmt(start)} to {fmt(end)} · output {outputLength.toFixed(1)}s</span></div>
              <label className="mt-2 flex items-center gap-3 text-xs"><span className="w-9">Start</span><input type="range" min={0} max={Math.max(0.1, duration)} step={0.1} value={start} onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.5))} className="flex-1 accent-[hsl(var(--primary))]" aria-label="Trim start in seconds" /></label>
              <label className="mt-1 flex items-center gap-3 text-xs"><span className="w-9">End</span><input type="range" min={0} max={Math.max(0.1, Math.min(duration, MAX_SECONDS))} step={0.1} value={end} onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.5))} className="flex-1 accent-[hsl(var(--primary))]" aria-label="Trim end in seconds" /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">Speed</p><div className="mt-1.5 flex gap-1.5">{SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className={cn("flex-1 rounded-lg border py-1.5 text-xs font-semibold", speed === s ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>{s}x</button>)}</div></div>
              <div><p className="text-xs text-muted-foreground">Frame</p><div className="mt-1.5 flex gap-1.5">{ASPECTS.map((a) => <button key={a.id} type="button" aria-pressed={aspect === a.id} onClick={() => setAspect(a.id)} className={cn("flex-1 rounded-lg border px-1 py-1.5 text-[11px] font-semibold", aspect === a.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>{a.label}</button>)}</div></div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {EFFECTS.map((item) => <button type="button" key={item.id} aria-pressed={effect === item.id} onClick={() => setEffect(item.id)} className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold", effect === item.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")} data-testid={`button-effect-${item.id}`}>{effect === item.id ? <Check className="h-3 w-3" /> : null}{item.label}</button>)}
              <button type="button" aria-pressed={mirror} onClick={() => setMirror((m) => !m)} className={cn("ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold", mirror ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}><FlipHorizontal className="h-3.5 w-3.5" />Mirror</button>
            </div>
            <label className="flex items-center gap-3 text-xs"><span className="w-24 text-muted-foreground">Original sound</span><input type="range" min={0} max={1} step={0.05} value={originalVolume} onChange={(e) => setOriginalVolume(Number(e.target.value))} className="flex-1 accent-[hsl(var(--primary))]" aria-label="Original sound volume" /><span className="w-9 tabular-nums">{Math.round(originalVolume * 100)}%</span></label>
          </fieldset>

          <div className="mt-6 rounded-2xl border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Music2 className="h-4 w-4" />Your own music</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">VastMind has no music library. Add only a track you made or have permission to share.</p>
            <input ref={audioRef} type="file" accept="audio/*" className="sr-only" aria-label="Choose your audio track" onChange={(e) => { selectAudio(e.target.files?.[0]); e.currentTarget.value = ""; }} data-testid="input-clip-audio" />
            <div className="mt-3 flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => audioRef.current?.click()} className="max-w-full rounded-full" data-testid="button-select-audio"><span className="truncate">{audioFile ? audioFile.name : "Upload a track"}</span></Button>
              {audioFile ? <button onClick={() => { setAudioFile(null); setRightsOk(false); }} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Remove audio track"><X className="h-4 w-4" /></button> : null}
            </div>
            {audioFile ? <>
              <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" checked={rightsOk} onChange={(e) => setRightsOk(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="checkbox-music-rights" />I own this music or have permission to use it in a public clip. I understand it may be removed if that isn't true.</label>
              {canRender ? <label className="mt-3 flex items-center gap-3 text-xs"><span className="w-24 text-muted-foreground">Music volume</span><input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} className="flex-1 accent-[hsl(var(--primary))]" aria-label="Music volume" /><span className="w-9 tabular-nums">{Math.round(musicVolume * 100)}%</span></label> : null}
            </> : null}
          </div>

          {canRender ? <Button onClick={() => void runRender()} disabled={!source || busy || fresh} variant={fresh ? "outline" : "default"} className="mt-5 w-full rounded-full" data-testid="button-render-preview">
            {stage === "rendering" || (stage === "uploading" && !rendered) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : fresh ? <Check className="mr-2 h-4 w-4" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {fresh ? "Preview is up to date" : rendered ? "Render again with changes" : "Render preview"}
          </Button> : null}

          <div className="mt-6 rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-semibold"><Captions className="h-4 w-4" />Captions</p>
              <Button variant="ghost" size="sm" className="h-8 rounded-full" disabled={busy || cues.length >= 60 || (canRender && !fresh)} onClick={() => setCues((c) => { const last = c[c.length - 1]; const s = last ? last.end : 0; return [...c, { start: s, end: Math.min(90, s + 3), text: "" }]; })}><Plus className="mr-1 h-3.5 w-3.5" />Add line</Button></div>
            {canRender && !fresh ? <p className="mt-2 text-xs text-muted-foreground">{rendered ? "Your edit changed. Render again before reviewing captions so their timing matches." : "Render your preview first so captions line up with the final clip."}</p> : <>
              <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} disabled={!canTranscribe} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="checkbox-ai-consent" />Send this clip's audio to an AI transcription service to draft captions. Nothing is posted until you publish.</label>
              <Button variant="outline" size="sm" className="mt-3 rounded-full" disabled={!aiConsent || busy || !canTranscribe} onClick={() => void runTranscribe()} data-testid="button-transcribe">{stage === "transcribing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Draft captions with AI</Button>
              {!canTranscribe && !caps.isLoading ? <p className="mt-2 text-xs text-muted-foreground">AI captions aren't available right now. You can still write them yourself.</p> : null}
            </>}
            {cues.length ? <p className="mt-3 rounded-lg bg-[hsl(42_90%_60%/.18)] px-3 py-2 text-[11px] leading-relaxed">Review timing: drafted lines use rough 5-second windows. Adjust start and end so each line matches the speech.</p> : null}
            <ol className="mt-3 space-y-2">
              {cues.map((cue, i) => <li key={i} className="grid grid-cols-[58px_58px_1fr_auto] items-center gap-1.5">
                <input type="number" min={0} max={90} step={0.1} value={cue.start} onChange={(e) => setCues((c) => c.map((x, j) => j === i ? { ...x, start: Number(e.target.value) } : x))} className="h-9 rounded-lg border bg-background px-2 text-xs tabular-nums" aria-label={`Line ${i + 1} start seconds`} />
                <input type="number" min={0} max={90} step={0.1} value={cue.end} onChange={(e) => setCues((c) => c.map((x, j) => j === i ? { ...x, end: Number(e.target.value) } : x))} className={cn("h-9 rounded-lg border bg-background px-2 text-xs tabular-nums", !(cue.end > cue.start) && "border-destructive")} aria-label={`Line ${i + 1} end seconds`} />
                <input value={cue.text} maxLength={500} onChange={(e) => setCues((c) => c.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} className="h-9 min-w-0 rounded-lg border bg-background px-2.5 text-sm" placeholder="What's said" aria-label={`Line ${i + 1} text`} />
                <button onClick={() => setCues((c) => c.filter((_, j) => j !== i))} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label={`Remove line ${i + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>)}
            </ol>
            {cueProblem ? <p role="alert" className="mt-2 text-xs text-destructive">Each line needs an end time after its start.</p> : null}
          </div>

          <label className="mt-6 block text-sm font-semibold" htmlFor="clip-caption">Description <span className="font-normal text-muted-foreground">· your words</span></label>
          <Textarea id="clip-caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={5000} rows={3} placeholder="What did you make, learn, or notice?" className="mt-2 resize-none rounded-2xl bg-background" data-testid="input-clip-caption" />

          {stageError ? <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{stageError}</p> : null}
          <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
            <p className="text-xs text-muted-foreground" role="status">{busy ? stageText[stage as keyof typeof stageText] : needsRender && source ? "Render a preview to publish your edit." : `${caption.length}/5000`}</p>
            <Button onClick={() => void publish()} disabled={!canPublish} className="rounded-full px-6" data-testid="button-publish-clip">
              {stage === "publishing" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing</> : "Share clip"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
