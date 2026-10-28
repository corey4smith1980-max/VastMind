"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { AlertTriangle, Camera, Check, Loader2, QrCode, ShieldCheck, X } from "lucide-react";
import {
  useApproveIdentityDeviceLink,
  useCompleteIdentityDeviceLink,
  useGetIdentityDeviceLinkStatus,
  useStartIdentityDeviceLink,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PairingProof = { requestId: string; token: string };
type PairingRequest = PairingProof & { qrDataUrl: string; expiresAt: string };

function parsePairingQr(raw: string): PairingProof | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      value.app === "VastMind"
      && value.action === "device-link"
      && value.version === 1
      && typeof value.requestId === "string"
      && /^[0-9a-f-]{36}$/i.test(value.requestId)
      && typeof value.token === "string"
      && /^[A-Za-z0-9_-]{43}$/.test(value.token)
    ) {
      return { requestId: value.requestId, token: value.token };
    }
  } catch {
    return null;
  }
  return null;
}

/** A new browser displays a short-lived QR and must still prove the password. */
export function DeviceLinkLogin() {
  const start = useStartIdentityDeviceLink();
  const check = useGetIdentityDeviceLinkStatus();
  const complete = useCompleteIdentityDeviceLink();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<PairingRequest | null>(null);
  const [status, setStatus] = useState<"pending" | "approved" | "processing" | "completed" | "expired">("pending");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchStatus = check.mutateAsync;
  useEffect(() => {
    if (!open || !request || status !== "pending") return;
    let cancelled = false;
    let timeout: number | undefined;
    let inFlight = false;
    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const result = await fetchStatus({ data: { requestId: request.requestId, token: request.token } });
        if (cancelled) return;
        setStatus(result.status);
        if (result.status === "pending") timeout = window.setTimeout(() => void poll(), 5000);
      } catch {
        if (!cancelled) timeout = window.setTimeout(() => void poll(), 7000);
      } finally {
        inFlight = false;
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [fetchStatus, open, request, status]);

  async function createRequest() {
    setBusy(true);
    setMessage("");
    try {
      const result = await start.mutateAsync();
      setRequest(result);
      setStatus("pending");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create a pairing QR.");
    } finally {
      setBusy(false);
    }
  }

  async function finishPairing(event: React.FormEvent) {
    event.preventDefault();
    if (!request || !password) return;
    setBusy(true);
    setMessage("");
    try {
      await complete.mutateAsync({
        data: { requestId: request.requestId, token: request.token, password },
      });
      setPassword("");
      window.location.assign("/chats");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not finish device sign-in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-muted/20 p-4">
      <button type="button" className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open} onClick={() => { setOpen((value) => !value); setMessage(""); }}>
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><QrCode className="h-4 w-4" /></span>
          <span><span className="block text-sm font-semibold">Link this device with QR</span><span className="block text-xs text-muted-foreground">Approve from a device already signed in</span></span>
        </span>
        {open ? <X className="h-4 w-4 text-muted-foreground" /> : <span className="text-xs font-semibold text-primary">Link</span>}
      </button>
      {open && (
        <div className="mt-4 border-t pt-4">
          {!request || status === "expired" ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">Open Account Security on your signed-in device and scan this QR. It expires after three minutes.</p>
              {status === "expired" && <p role="status" className="text-xs text-amber-700">This QR expired. Create a fresh one to continue.</p>}
              <Button type="button" variant="outline" className="w-full gap-2" onClick={() => void createRequest()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                {request ? "Create a new QR" : "Show pairing QR"}
              </Button>
            </div>
          ) : status === "approved" ? (
            <form onSubmit={finishPairing} className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>The signed-in device approved this request. Enter the VastMind account password to finish linking.</p>
              </div>
              <Input type="password" autoComplete="current-password" aria-label="VastMind account password" placeholder="Account password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <Button type="submit" className="w-full" disabled={!password || busy}>{busy ? "Verifying…" : "Verify password and sign in"}</Button>
              {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            </form>
          ) : status === "completed" ? (
            <p role="status" className="text-sm text-primary">This device is linked. Opening VastMind…</p>
          ) : (
            <div className="space-y-3 text-center">
              <div className="mx-auto grid w-fit place-items-center rounded-2xl border bg-white p-3 shadow-sm">
                <img src={request.qrDataUrl} alt="QR code to link this VastMind device" className="h-48 w-48" />
              </div>
              <p role="status" className="text-sm text-muted-foreground">Waiting for approval from your signed-in device…</p>
              <p className="text-xs text-muted-foreground">Only approve a QR that you are viewing on this device.</p>
              {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** A signed-in browser scans and explicitly approves the new device's QR. */
export function DeviceLinkScanner() {
  const approve = useApproveIdentityDeviceLink();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [proof, setProof] = useState<PairingProof | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let cancelled = false;
    let controls: { stop: () => void } | undefined;
    const reader = new BrowserQRCodeReader();
    void reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _error, nextControls) => {
      controls = nextControls;
      if (!result || cancelled || proof) return;
      const parsed = parsePairingQr(result.getText());
      if (!parsed) {
        setMessage("This QR is not a VastMind device-link request.");
        return;
      }
      setProof(parsed);
      setScanning(false);
      controls?.stop();
      setMessage("");
    }).catch((error: unknown) => {
      if (!cancelled) {
        setMessage(error instanceof Error ? error.message : "Camera access is unavailable.");
        setScanning(false);
      }
    });
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [proof, scanning]);

  async function approveRequest() {
    if (!proof) return;
    setBusy(true);
    setMessage("");
    try {
      await approve.mutateAsync({ data: proof });
      setProof(null);
      setMessage("Approved. VastMind sent a critical security alert to your account. The new device still needs your password.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This QR request could not be approved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-center gap-2"><Camera className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Approve a new device</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">Scan a QR shown on the device you are adding. Approval alone does not sign it in; that device must also enter your password.</p>
      {!scanning && !proof && <Button type="button" variant="outline" className="mt-4 gap-2" onClick={() => { setMessage(""); setScanning(true); }}><Camera className="h-4 w-4" />Open QR scanner</Button>}
      {scanning && <div className="mt-4 space-y-3">
        <video ref={videoRef} className="aspect-video w-full rounded-xl bg-black object-cover" aria-label="Camera scanning for a VastMind device QR" />
        <Button type="button" variant="ghost" onClick={() => setScanning(false)}>Cancel scan</Button>
      </div>}
      {proof && <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p className="text-sm font-medium">Approve this new device? Only continue if you started this request and can see the QR on the device being added.</p></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void approveRequest()} disabled={busy} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve QR request</Button>
          <Button type="button" variant="outline" onClick={() => { setProof(null); setMessage(""); }}>Not now</Button>
        </div>
      </div>}
      {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
