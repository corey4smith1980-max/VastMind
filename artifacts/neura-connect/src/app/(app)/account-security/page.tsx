"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Fingerprint, KeyRound, Monitor, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { AddPasskeyButton, MigrationNotice, PasskeyPasswordResetForm } from "@/components/vastmind-access";
import { DeviceLinkScanner } from "@/components/vastmind-access/device-link";
import { SessionManager } from "@/components/vastmind-access/session-manager";
import { identityCall, useAuth } from "@/lib/vastmind-auth";
import { useMe } from "@/lib/me";
import { accountRecoveryPublicKey, createRecoveryPhrase } from "@workspace/mail-crypto";

type TrustedDevice = {
  id: string;
  kind: "web" | "mobile";
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  current: boolean;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function downloadPhrase(phrase: string, username: string): void {
  const blob = new Blob(
    [`VastMind account recovery phrase\nAccount: @${username}\n\n${phrase}\n\nKeep this file private. Anyone with this phrase can add a device to your account.\n`],
    { type: "text/plain;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vastmind-recovery-${username}.txt`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PasswordSettings() {
  const [enabled, setEnabled] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void identityCall<{ enabled: boolean }>("password-status", "GET")
      .then((result) => setEnabled(result.enabled))
      .catch(() => setMessage("Sign in with a VastMind passkey to manage your password."));
  }, []);

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 12 || newPassword !== confirmPassword) return;
    setBusy(true);
    setMessage("");
    try {
      await identityCall("password", "POST", {
        newPassword,
        ...(enabled ? { currentPassword } : {}),
      });
      setEnabled(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Your VastMind password has been saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Trusted-device password</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">Password sign-in works only with an existing trusted-device credential. Resetting a password never adds a device to that trusted list.</p>
      <form onSubmit={savePassword} className="mt-4 max-w-md space-y-3">
        {enabled && <div className="space-y-1.5"><Label htmlFor="current-vastmind-password">Current password</Label><Input id="current-vastmind-password" type="password" autoComplete="current-password" minLength={1} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div>}
        <div className="space-y-1.5"><Label htmlFor="new-vastmind-password">{enabled ? "New password" : "Create a password"}</Label><Input id="new-vastmind-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><p className="text-xs text-muted-foreground">At least 12 characters.</p></div>
        <div className="space-y-1.5"><Label htmlFor="confirm-vastmind-password">Confirm password</Label><Input id="confirm-vastmind-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
        <Button type="submit" disabled={busy || newPassword.length < 12 || newPassword !== confirmPassword || (enabled && !currentPassword)}>{busy ? "Saving…" : enabled ? "Change password" : "Set password"}</Button>
      </form>
      {enabled && <div className="mt-4 border-t pt-4">
        <p className="text-sm text-muted-foreground">Forgot your current password? Reset it from a passkey-authenticated session.</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => setResetOpen((value) => !value)}>{resetOpen ? "Close passkey reset" : "Reset with passkey"}</Button>
        {resetOpen && <div className="mt-3"><PasskeyPasswordResetForm /></div>}
      </div>}
      {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}

function TrustedDevices() {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      const result = await identityCall<{ items: TrustedDevice[] }>("trusted-devices", "GET");
      setDevices(result.items);
    } catch {
      setMessage("Sign in with a passkey before managing trusted devices.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function trustThisDevice() {
    setBusyId("current");
    setMessage("");
    try {
      await identityCall("trusted-devices", "POST", {});
      setMessage("This device is ready for password sign-in.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not trust this device.");
    } finally {
      setBusyId("");
    }
  }

  async function revoke(deviceId: string) {
    setBusyId(deviceId);
    setMessage("");
    try {
      await identityCall(`trusted-devices/${encodeURIComponent(deviceId)}`, "DELETE");
      setDevices((current) => current.filter((device) => device.id !== deviceId));
      setMessage("Device trust was revoked. Its active session was also ended.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke this device.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-display text-xl font-semibold">Trusted devices</h2><p className="mt-1 text-sm text-muted-foreground">Only broad device type and dates are shown. VastMind does not display device fingerprints or IP addresses.</p></div>
        <Button type="button" variant="outline" onClick={trustThisDevice} disabled={!!busyId}>{busyId === "current" ? "Adding…" : "Trust this device"}</Button>
      </div>
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading devices…</p> : devices.length ? (
        <ul className="mt-4 divide-y">
          {devices.map((device) => {
            const DeviceIcon = device.kind === "mobile" ? Smartphone : Monitor;
            return <li key={device.id} className="flex items-center gap-3 py-3">
              <DeviceIcon className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{device.kind === "mobile" ? "VastMind mobile app" : "Web browser"}{device.current ? " · This device" : ""}</p>
                <p className="text-xs text-muted-foreground">Added {formatDate(device.createdAt)} · Last used {device.lastUsedAt ? formatDate(device.lastUsedAt) : "not yet"} · Expires {formatDate(device.expiresAt)}</p>
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label={`Revoke ${device.kind} device`} onClick={() => void revoke(device.id)} disabled={!!busyId}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>;
          })}
        </ul>
      ) : <p className="mt-4 text-sm text-muted-foreground">No trusted devices have been added.</p>}
      {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}

function RecoveryPhraseSettings({ username }: { username: string }) {
  const [phrase, setPhrase] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const words = phrase ? phrase.split(" ") : [];
  const positions = [2, 11, 20];
  const confirmed = downloaded && positions.every((position, index) => answers[index].trim().toLowerCase() === words[position]);

  async function replacePhrase() {
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      const publicKey = await accountRecoveryPublicKey(phrase);
      await identityCall("recovery-key", "PUT", { publicKey });
      setPhrase("");
      setAnswers(["", "", ""]);
      setDownloaded(false);
      setMessage("Your recovery phrase has been replaced. The previous phrase no longer works.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the recovery phrase.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">24-word recovery phrase</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">The phrase from account setup cannot be shown again because VastMind never stores it. Generate a replacement on this device, download it, and verify three words before the new phrase becomes active. This is separate from any private-mail encryption phrase.</p>
      {!phrase ? <Button className="mt-4" type="button" onClick={() => { setPhrase(createRecoveryPhrase()); setDownloaded(false); setAnswers(["", "", ""]); setMessage(""); }}>Create replacement phrase</Button> : <>
        <ol className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">
          {words.map((word, index) => <li key={index} className="rounded-lg bg-muted/60 px-3 py-2"><span className="mr-2 text-muted-foreground">{index + 1}</span>{word}</li>)}
        </ol>
        <div className="mt-4 space-y-3">
          <Button type="button" variant="outline" className="gap-2" onClick={() => { downloadPhrase(phrase, username); setDownloaded(true); }}><Download className="h-4 w-4" />Download .txt</Button>
          <p className="text-xs text-muted-foreground">The file is unencrypted. Store it privately and delete extra copies. The phrase stays in this browser only until you leave or replace it.</p>
          {positions.map((position, index) => <div key={position} className="space-y-1.5">
            <Label htmlFor={`recovery-word-${position}`}>Confirm word {position + 1}</Label>
            <Input id={`recovery-word-${position}`} autoComplete="off" value={answers[index]} onChange={(event) => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer))} />
          </div>)}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!confirmed || busy} onClick={() => void replacePhrase()}>{busy ? "Replacing…" : "Replace recovery phrase"}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPhrase(""); setAnswers(["", "", ""]); setDownloaded(false); }}>Discard</Button>
          </div>
        </div>
      </>}
      {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}

export default function AccountSecurityPage() {
  const { provider } = useAuth();
  const me = useMe();
  return (
    <PageScroll>
      <PageHeader kicker="Settings" title="Account security" sub="How you sign in to VastMind." />
      <div className="mt-6 space-y-6">
        <section className="rounded-2xl border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your VastMind ID</p>
          <p className="font-display mt-2 break-all text-2xl font-semibold" data-testid="text-vastmind-id">{me.username}@vastmind.com</p>
            <p className="mt-1 text-sm text-muted-foreground">Password access is restricted to trusted devices. Add another active device by scanning a QR from a device already signed in and verifying your password. Current session: {provider === "vastmind" ? "VastMind" : "legacy sign-in"}.</p>
        </section>
        <section className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Passkeys</h2></div>
          {provider === "clerk" ? (
            <div className="mt-3 space-y-4">
              <p className="text-sm text-muted-foreground">Your account still uses the legacy sign-in. Set up a passkey and recovery phrase for this same account; your chats and follows stay put.</p>
              <Button asChild><Link href="/sign-up?migrate=1" data-testid="link-enroll-passkey">Set up a passkey</Link></Button>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <p className="text-sm text-muted-foreground">Add a passkey on another phone, laptop or security key so you are not tied to one device.</p>
              <AddPasskeyButton />
            </div>
          )}
        </section>
        {provider === "vastmind" && <PasswordSettings />}
        {provider === "vastmind" && <RecoveryPhraseSettings username={me.username} />}
        <SessionManager />
        {provider === "vastmind" && <TrustedDevices />}
        {provider === "vastmind" && <DeviceLinkScanner />}
        <MigrationNotice />
      </div>
    </PageScroll>
  );
}
