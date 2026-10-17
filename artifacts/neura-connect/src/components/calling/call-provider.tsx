"use client";
// ---------- WebRTC mesh calling (signalling via socket.io, see api-server/src/lib/calls.ts) ----------
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Mic, MicOff, Minimize2, Phone, PhoneOff, Video, VideoOff, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMe } from "@/lib/me";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";

type Scope = "chat" | "community";
type PeerInfo = { socketId: string; userId: string; name: string };
type IceServer = { urls: string | string[]; username?: string; credential?: string };
type JoinAck = { roomId: string; scope: Scope; id: string; title: string; video: boolean; peers: PeerInfo[]; iceServers: IceServer[]; relayConfigured: boolean } | { error: string };
type SignalMsg = { roomId: string; from: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type Invite = { scope: "chat"; id: string; title: string; video: boolean; caller: string; at: number };
type PeerStatus = "connecting" | "connected" | "reconnecting" | "failed";
type PeerView = PeerInfo & { status: PeerStatus; stream: MediaStream | null };
type Phase = "idle" | "media" | "joining" | "live" | "error";

type PeerConn = { info: PeerInfo; pc: RTCPeerConnection; queue: Promise<void>; pending: RTCIceCandidateInit[]; stream: MediaStream; timer: number | null };

type CallCtx = {
  phase: Phase;
  busy: boolean;
  startCall: (opts: { scope: Scope; id: string; video: boolean; title?: string }) => void;
  leave: () => void;
};
const Ctx = createContext<CallCtx>({ phase: "idle", busy: false, startCall: () => {}, leave: () => {} });
export const useCall = () => useContext(Ctx);

const CONNECT_TIMEOUT = 25_000;
const INVITE_TTL = 30_000;

function MediaTile({ stream, muted, mirrored, name, status, video, local }: { stream: MediaStream | null; muted?: boolean; mirrored?: boolean; name: string; status?: PeerStatus; video: boolean; local?: boolean }) {
  const vRef = useRef<HTMLVideoElement>(null);
  const aRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (vRef.current && vRef.current.srcObject !== stream) vRef.current.srcObject = stream;
    if (aRef.current && aRef.current.srcObject !== stream) { aRef.current.srcObject = stream; aRef.current.play().catch(() => {}); }
  });
  const label = local ? "You" : name;
  const statusText = status === "connected" ? "Connected" : status === "failed" ? "Couldn't connect" : status === "reconnecting" ? "Reconnecting…" : status ? "Connecting…" : "";
  return (
    <div className="relative flex aspect-video min-h-[120px] items-center justify-center overflow-hidden rounded-2xl bg-[hsl(var(--ink,200_20%_15%)/.92)] text-white" data-testid={local ? "tile-local" : `tile-peer-${name}`}>
      {video ? (
        <video ref={vRef} autoPlay playsInline muted={muted ?? true} className={cn("h-full w-full object-cover", mirrored && "-scale-x-100")} />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/80 font-display text-2xl font-semibold">{label.slice(0, 1).toUpperCase()}</span>
      )}
      {!local && !video ? <audio ref={aRef} autoPlay /> : null}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs backdrop-blur">
        {status && status !== "connected" ? (status === "failed" ? <AlertTriangle className="h-3 w-3 text-amber-300" /> : <Loader2 className="h-3 w-3 animate-spin" />) : null}
        <span className="max-w-[10rem] truncate font-medium">{label}</span>
        {statusText ? <span className="opacity-75">· {statusText}</span> : null}
      </span>
    </div>
  );
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { socket, status: rtStatus } = useRealtime();
  const me = useMe();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [video, setVideo] = useState(false);
  const [relayWarn, setRelayWarn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [peers, setPeers] = useState<Record<string, PeerView>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);

  const session = useRef(0); // bump to cancel in-flight work
  const local = useRef<MediaStream | null>(null);
  const conns = useRef<Map<string, PeerConn>>(new Map());
  const room = useRef<{ roomId: string; ice: IceServer[] } | null>(null);
  const sockRef = useRef(socket);
  sockRef.current = socket;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const patchPeer = useCallback((id: string, p: Partial<PeerView>) => {
    setPeers((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...p } } : prev));
  }, []);

  const dropPeer = useCallback((id: string) => {
    const c = conns.current.get(id);
    if (c) { if (c.timer) window.clearTimeout(c.timer); c.pc.onicecandidate = null; c.pc.ontrack = null; c.pc.onconnectionstatechange = null; c.pc.close(); conns.current.delete(id); }
    setPeers((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const teardown = useCallback((notifyServer: boolean) => {
    session.current++;
    for (const id of [...conns.current.keys()]) dropPeer(id);
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    if (notifyServer && room.current) sockRef.current?.emit("call:leave");
    room.current = null;
    setLocalStream(null);
    setPeers({});
    setRelayWarn(false);
    setMinimized(false);
  }, [dropPeer]);

  const leave = useCallback(() => { teardown(true); setError(null); setPhase("idle"); }, [teardown]);
  const fail = useCallback((msg: string) => { teardown(true); setError(msg); setPhase("error"); }, [teardown]);

  const createConn = useCallback((info: PeerInfo): PeerConn => {
    const existing = conns.current.get(info.socketId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: room.current?.ice ?? [] });
    const stream = new MediaStream();
    const c: PeerConn = { info, pc, queue: Promise.resolve(), pending: [], stream, timer: null };
    conns.current.set(info.socketId, c);
    local.current?.getTracks().forEach((t) => pc.addTrack(t, local.current!));
    pc.ontrack = (e) => {
      if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
      patchPeer(info.socketId, { stream: new MediaStream(stream.getTracks()) });
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && room.current) sockRef.current?.emit("call:signal", { roomId: room.current.roomId, to: info.socketId, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") { if (c.timer) { window.clearTimeout(c.timer); c.timer = null; } patchPeer(info.socketId, { status: "connected" }); }
      else if (s === "disconnected") patchPeer(info.socketId, { status: "reconnecting" });
      else if (s === "failed") patchPeer(info.socketId, { status: "failed" });
    };
    c.timer = window.setTimeout(() => { if (pc.connectionState !== "connected") patchPeer(info.socketId, { status: "failed" }); }, CONNECT_TIMEOUT);
    setPeers((prev) => ({ ...prev, [info.socketId]: { ...info, status: "connecting", stream: null } }));
    return c;
  }, [patchPeer]);

  const enqueue = (c: PeerConn, fn: () => Promise<void>) => {
    c.queue = c.queue.then(fn).catch(() => patchPeer(c.info.socketId, { status: "failed" }));
  };

  const flushIce = async (c: PeerConn) => {
    const list = c.pending.splice(0);
    for (const cand of list) await c.pc.addIceCandidate(cand).catch(() => {});
  };

  const startCall = useCallback<CallCtx["startCall"]>(({ scope, id, video: wantVideo, title: t }) => {
    if (phaseRef.current === "media" || phaseRef.current === "joining" || phaseRef.current === "live") return;
    const s = sockRef.current;
    const wantV = scope === "chat" && wantVideo;
    setInvite(null);
    setError(null);
    setTitle(t ?? "Call");
    setVideo(wantV);
    setMicOn(true);
    setCamOn(true);
    setMinimized(false);
    if (!s || !s.connected) { setError("You're offline right now. Reconnect and try again."); setPhase("error"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError("This browser can't access a microphone. Try a recent Chrome, Safari or Firefox over HTTPS."); setPhase("error"); return; }
    const my = ++session.current;
    setPhase("media");
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: wantV ? { width: { ideal: 640 }, height: { ideal: 480 } } : false })
      .then((stream) => {
        if (my !== session.current) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        local.current = stream;
        setLocalStream(stream);
        setPhase("joining");
        let settled = false;
        const timeout = window.setTimeout(() => { if (!settled && my === session.current) { settled = true; fail("The call server didn't answer in time. Check your connection and try again."); } }, CONNECT_TIMEOUT);
        s.emit("call:join", { scope, id, video: wantV }, (ack: JoinAck) => {
          window.clearTimeout(timeout);
          if (my !== session.current || settled) { if (!("error" in ack)) s.emit("call:leave"); return; }
          settled = true;
          if ("error" in ack) { teardown(false); setError(ack.error || "Call unavailable"); setPhase("error"); return; }
          room.current = { roomId: ack.roomId, ice: ack.iceServers };
          setTitle(ack.title || t || "Call");
          if (!ack.video && wantV) { stream.getVideoTracks().forEach((tr) => { tr.stop(); stream.removeTrack(tr); }); setVideo(false); }
          setRelayWarn(!ack.relayConfigured);
          setPhase("live");
          // Newcomer offers to everyone already present.
          for (const p of ack.peers) {
            const c = createConn(p);
            enqueue(c, async () => {
              const offer = await c.pc.createOffer();
              await c.pc.setLocalDescription(offer);
              if (room.current) s.emit("call:signal", { roomId: room.current.roomId, to: p.socketId, description: { type: "offer", sdp: offer.sdp } });
            });
          }
        });
      })
      .catch((e: unknown) => {
        if (my !== session.current) return;
        const name = e instanceof DOMException ? e.name : "";
        setError(name === "NotAllowedError" ? `${wantV ? "Camera and microphone" : "Microphone"} access was blocked. Allow it in your browser's site settings, then try again.`
          : name === "NotFoundError" ? `No ${wantV ? "camera or microphone" : "microphone"} was found on this device.`
          : name === "NotReadableError" ? "Another app is using your microphone or camera." : "Couldn't start your microphone.");
        setPhase("error");
      });
  }, [createConn, fail, teardown]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;
    const onSignal = (m: SignalMsg) => {
      if (!room.current || m.roomId !== room.current.roomId) return;
      let c = conns.current.get(m.from);
      if (!c) {
        if (m.description?.type !== "offer") return;
        c = createConn({ socketId: m.from, userId: "", name: "Participant" });
      }
      const conn = c;
      if (m.description) {
        const d = m.description;
        enqueue(conn, async () => {
          await conn.pc.setRemoteDescription(d);
          await flushIce(conn);
          if (d.type === "offer") {
            const ans = await conn.pc.createAnswer();
            await conn.pc.setLocalDescription(ans);
            if (room.current) socket.emit("call:signal", { roomId: room.current.roomId, to: m.from, description: { type: "answer", sdp: ans.sdp } });
          }
        });
      } else if (m.candidate) {
        const cand = m.candidate;
        enqueue(conn, async () => {
          if (conn.pc.remoteDescription) await conn.pc.addIceCandidate(cand).catch(() => {});
          else conn.pending.push(cand);
        });
      }
    };
    const onJoined = (p: { roomId: string; peer: PeerInfo }) => {
      if (!room.current || p.roomId !== room.current.roomId) return;
      // Existing peer waits for the newcomer's offer; register name now.
      createConn(p.peer);
    };
    const onLeft = (p: { roomId: string; socketId: string }) => { if (room.current?.roomId === p.roomId) dropPeer(p.socketId); };
    const onEnded = (p: { reason?: string }) => { if (room.current) fail(p?.reason || "The call ended."); };
    const onInvite = (p: Omit<Invite, "at">) => {
      if (phaseRef.current !== "idle" && phaseRef.current !== "error") return;
      setInvite({ ...p, at: Date.now() });
    };
    const onDisconnect = () => { if (room.current || phaseRef.current === "joining") fail("Connection lost — the call was disconnected."); };
    socket.on("call:signal", onSignal);
    socket.on("call:peer-joined", onJoined);
    socket.on("call:peer-left", onLeft);
    socket.on("call:ended", onEnded);
    socket.on("call:invite", onInvite);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("call:signal", onSignal); socket.off("call:peer-joined", onJoined); socket.off("call:peer-left", onLeft);
      socket.off("call:ended", onEnded); socket.off("call:invite", onInvite); socket.off("disconnect", onDisconnect);
    };
  }, [socket, createConn, dropPeer, fail]);

  // Socket gone (sign-out / provider teardown) ends any call.
  useEffect(() => { if (!socket && rtStatus === "offline" && phaseRef.current !== "idle") { teardown(false); setPhase("idle"); setInvite(null); } }, [socket, rtStatus, teardown]);
  // Identity change or unmount.
  useEffect(() => () => teardown(true), [me.id, teardown]);

  // Invitation expiry
  useEffect(() => {
    if (!invite) return;
    const t = window.setTimeout(() => setInvite(null), Math.max(0, INVITE_TTL - (Date.now() - invite.at)));
    return () => window.clearTimeout(t);
  }, [invite]);

  // Relay warning is brief
  useEffect(() => { if (!relayWarn) return; const t = window.setTimeout(() => setRelayWarn(false), 9000); return () => window.clearTimeout(t); }, [relayWarn]);

  const toggleMic = () => { const on = !micOn; local.current?.getAudioTracks().forEach((t) => (t.enabled = on)); setMicOn(on); };
  const toggleCam = () => { const on = !camOn; local.current?.getVideoTracks().forEach((t) => (t.enabled = on)); setCamOn(on); };

  const busy = phase === "media" || phase === "joining" || phase === "live";
  const ctx = useMemo(() => ({ phase, busy, startCall, leave }), [phase, busy, startCall, leave]);
  const peerList = Object.values(peers);
  const connected = peerList.filter((p) => p.status === "connected").length;
  const headline = phase === "media" ? "Asking for your microphone…" : phase === "joining" ? "Joining…"
    : peerList.length === 0 ? "Waiting for others to join…" : connected === 0 ? "Connecting…" : `${connected + 1} on the call`;
  const dialogOpen = (busy && !minimized) || phase === "error";

  return (
    <Ctx.Provider value={ctx}>
      {children}

      {/* Incoming invitation */}
      {invite && !busy ? (
        <div role="alertdialog" aria-live="assertive" aria-label={`Incoming ${invite.video ? "video" : "voice"} call`} className="rise fixed inset-x-3 top-3 z-[60] mx-auto max-w-sm rounded-3xl border bg-card p-4 shadow-xl" data-testid="call-invite">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Incoming {invite.video ? "video" : "voice"} call</p>
          <p className="mt-1 font-display text-xl font-semibold leading-tight">{invite.caller}</p>
          <p className="truncate text-sm text-muted-foreground">{invite.title}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => setInvite(null)} data-testid="button-decline-call"><PhoneOff className="mr-1.5 h-4 w-4" /> Decline</Button>
            <Button className="flex-1 rounded-full" onClick={() => startCall({ scope: "chat", id: invite.id, video: invite.video, title: invite.title })} data-testid="button-accept-call">
              {invite.video ? <Video className="mr-1.5 h-4 w-4" /> : <Phone className="mr-1.5 h-4 w-4" />} Accept
            </Button>
          </div>
        </div>
      ) : null}

      {/* Minimized pill keeps the call while browsing */}
      {busy && minimized ? (
        <div className="fixed bottom-[80px] right-3 z-[55] flex items-center gap-1 rounded-full border bg-card p-1 pl-3 shadow-lg md:bottom-4" data-testid="call-pill">
          <button className="flex items-center gap-2 text-sm font-medium" onClick={() => setMinimized(false)} aria-label="Open call">
            <span className={cn("h-2 w-2 rounded-full", connected ? "bg-primary" : "bg-amber-500")} />
            <span className="max-w-[9rem] truncate">{title}</span><Maximize2 className="h-3.5 w-3.5" />
          </button>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={toggleMic} aria-label={micOn ? "Mute" : "Unmute"}>{micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}</Button>
          <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full" onClick={leave} aria-label="Hang up"><PhoneOff className="h-4 w-4" /></Button>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { if (phase === "error") { setError(null); setPhase("idle"); } else setMinimized(true); } }}>
        <DialogContent className="max-h-[100dvh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto rounded-3xl" data-testid="call-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{title || "Call"}</DialogTitle>
            <DialogDescription aria-live="polite">{phase === "error" ? "The call couldn't continue." : headline}</DialogDescription>
          </DialogHeader>

          {phase === "error" ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm" role="alert">{error}</div>
          ) : (
            <>
              {relayWarn ? (
                <p className="flex gap-2 rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200" role="status">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> No relay (TURN) server is configured. Calls work on most home networks, but some office or mobile networks may fail to connect until TURN is set up.
                </p>
              ) : null}
              <div className={cn("grid gap-2", peerList.length ? "sm:grid-cols-2" : "")}>
                <MediaTile stream={localStream} muted mirrored name={me.name} video={video && camOn && !!localStream} local />
                {peerList.map((p) => <MediaTile key={p.socketId} stream={p.stream} muted={false} name={p.name} status={p.status} video={video && !!p.stream?.getVideoTracks().length} />)}
              </div>
              {phase === "media" || phase === "joining" ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {headline}</p> : null}
            </>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {phase === "error" ? (
              <Button className="rounded-full" onClick={() => { setError(null); setPhase("idle"); }}>Close</Button>
            ) : (
              <>
                <Button size="icon" variant={micOn ? "secondary" : "outline"} className="h-12 w-12 rounded-full" onClick={toggleMic} disabled={!localStream} aria-pressed={!micOn} aria-label={micOn ? "Mute microphone" : "Unmute microphone"} data-testid="button-call-mic">
                  {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </Button>
                {video ? (
                  <Button size="icon" variant={camOn ? "secondary" : "outline"} className="h-12 w-12 rounded-full" onClick={toggleCam} disabled={!localStream} aria-pressed={!camOn} aria-label={camOn ? "Turn camera off" : "Turn camera on"} data-testid="button-call-camera">
                    {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </Button>
                ) : null}
                <Button size="icon" variant="outline" className="h-12 w-12 rounded-full" onClick={() => setMinimized(true)} aria-label="Minimize call"><Minimize2 className="h-5 w-5" /></Button>
                <Button size="icon" variant="destructive" className="h-12 w-12 rounded-full" onClick={leave} aria-label="Hang up" data-testid="button-hangup"><PhoneOff className="h-5 w-5" /></Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
