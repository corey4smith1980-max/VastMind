"use client";
import { useEffect, useRef, useState } from "react";
import { completeMediaUpload, requestUploadUrl, type MediaAttachment as Attachment } from "@workspace/api-client-react";
import { Loader2, Mic, Paperclip, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";

/** Cookie-authenticated media endpoint checks current membership on every request. */
export function MediaPreview({ media }: { media: Attachment }) {
  if (media.contentType.startsWith("image/")) return <a href={media.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${media.name}`}><img src={media.url} alt={media.name} loading="lazy" className="mb-2 max-h-80 max-w-full rounded-xl object-contain" /></a>;
  if (media.contentType.startsWith("video/")) return <video src={media.url} controls playsInline preload="metadata" className="mb-2 max-h-80 max-w-full rounded-xl" aria-label={media.name} />;
  return <audio src={media.url} controls preload="metadata" className="mb-2 max-w-full" aria-label="Voice message" />;
}

export function MediaPicker({ purpose, chatId, value, onChange }: {
  purpose: "chat" | "status"; chatId?: string; value?: Attachment; onChange: (value?: Attachment) => void;
}) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadRef = useRef<(file: File) => Promise<void>>(async()=>{});
  useEffect(()=>{mounted.current=true;return ()=>{
    mounted.current=false;
    if(timer.current)clearTimeout(timer.current);
    const r=recorder.current;
    if(r && r.state!=="inactive"){r.onstop=null;r.stop();}
    stream.current?.getTracks().forEach(t=>t.stop());
  };},[]);
  async function upload(file: File) {
    if (!file.size || file.size > 25*1024*1024) { toast({title:"Choose a file under 25 MB",variant:"destructive"}); return; }
    setBusy(true);
    try {
      const contentType=file.type.split(";")[0];
      const ticket=await requestUploadUrl({name:file.name.slice(0,150),size:file.size,contentType,purpose,chatId});
      const response=await fetch(ticket.uploadUrl,{method:"PUT",headers:{"Content-Type":contentType},body:file});
      if(!response.ok)throw new Error("Upload failed. Please try again.");
      const media=await completeMediaUpload(ticket.id);
      if(mounted.current)onChange(media);
    } catch(e) {if(mounted.current)toast({title:"Couldn't upload media",description:errMessage(e),variant:"destructive"});}
    finally {if(mounted.current)setBusy(false);}
  }
  uploadRef.current=upload;
  async function record() {
    try {
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==="undefined")throw new Error("Voice recording isn't supported by this browser. You can attach an audio file instead.");
      const mic=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!mounted.current){mic.getTracks().forEach(t=>t.stop());return;}
      stream.current=mic;
      const mime=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus"].find(t=>MediaRecorder.isTypeSupported(t));
      if(!mime){mic.getTracks().forEach(t=>t.stop());throw new Error("This browser has no supported audio recorder.");}
      const r=new MediaRecorder(mic,{mimeType:mime});
      const chunks: BlobPart[]=[];
      let bytes=0;
      r.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>24*1024*1024&&r.state!=="inactive")r.stop();}};
      r.onstop=()=>{
        if(timer.current)clearTimeout(timer.current);
        mic.getTracks().forEach(t=>t.stop());recorder.current=null;
        if(!mounted.current)return;
        setRecording(false);
        const type=mime.split(";")[0],extension=type.split("/")[1];
        void uploadRef.current(new File(chunks,`voice-note.${extension}`,{type}));
      };
      recorder.current=r;r.start(1000);setRecording(true);
      timer.current=setTimeout(()=>{if(r.state!=="inactive")r.stop();},180_000);
    } catch(e){toast({title:"Microphone unavailable",description:errMessage(e),variant:"destructive"});}
  }
  return <div className="flex shrink-0 flex-wrap items-center gap-0.5">
    <input ref={input} type="file" className="sr-only" aria-label="Choose media" accept={purpose==="status"?"image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm":"image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav"} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void upload(file);}} />
    <Button type="button" size="icon" variant="ghost" disabled={busy||recording} aria-label="Attach photo or video" onClick={()=>input.current?.click()}>{busy?<Loader2 className="h-5 w-5 animate-spin"/>:<Paperclip className="h-5 w-5"/>}</Button>
    {purpose==="chat"&&<Button type="button" size="icon" variant={recording?"destructive":"ghost"} disabled={busy} aria-label={recording?"Stop recording":"Record voice note"} onClick={()=>recording?recorder.current?.stop():void record()}>{recording?<Square className="h-4 w-4"/>:<Mic className="h-5 w-5"/>}</Button>}
    {recording&&<span role="status" className="text-xs text-destructive">Recording · max 3 min</span>}
    {busy&&<span role="status" className="text-xs">Uploading…</span>}
    {value&&<span className="flex max-w-52 items-center gap-1 rounded-xl border px-2 text-xs"><span className="truncate">{value.name}</span><Button type="button" variant="ghost" size="icon" aria-label="Remove attachment" onClick={()=>onChange(undefined)}><X className="h-3 w-3"/></Button></span>}
  </div>;
}
