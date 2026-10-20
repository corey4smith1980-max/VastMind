"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Fingerprint, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { createRecoveryPhrase, accountRecoveryPublicKey, signAccountRecoveryChallenge } from "@workspace/mail-crypto";
import { useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth, vastMindAuthClient, identityRequest } from "@/lib/vastmind-auth";
import { basePath } from "@/lib/base";

export const USERNAME_RE = /^(?!member_[a-f0-9]{24}$)[a-zA-Z0-9_]{3,32}$/i;
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");
const goChats = () => window.location.assign(`${basePath}/chats`);

export function AccessCard({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h1 className="font-display mt-2 text-3xl font-semibold leading-tight">{title}</h1>
      {sub && <p className="mt-2 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-6 space-y-5">{children}</div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" data-testid="auth-error" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{message}</span>
    </div>
  );
}

export function MigrationNotice() {
  return (
    <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
      Your <span className="font-medium text-foreground">@vastmind.com</span> ID is an in-app identifier only. It is not a mailbox and does not prove ownership of any email domain.
      Passkey sign-in does not yet end-to-end encrypt all existing social data, and native app login still uses the legacy system during migration.
      {" "}Use a full browser tab on HTTPS; embedded previews may block passkeys.
    </p>
  );
}

function Busy({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return <>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{children}</>;
}

/* ---------- Passkey sign-in ---------- */
export function PasskeySignIn({ onRecover }: { onRecover: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signIn() {
    setBusy(true); setError(null);
    try {
      const res = await vastMindAuthClient.signIn.passkey({});
      if (res?.error) { setError(res.error.message ?? "Passkey sign-in was not completed."); return; }
      goChats();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }
  return (
    <AccessCard eyebrow="Sign in" title="Welcome back." sub="Use the passkey saved on this device. No password, no inbox code.">
      <Button size="lg" className="w-full gap-2" onClick={signIn} disabled={busy} aria-busy={busy} data-testid="button-passkey-sign-in">
        <Busy busy={busy}><Fingerprint className={busy ? "hidden" : "h-4 w-4"} />{busy ? "Waiting for your passkey" : "Sign in with passkey"}</Busy>
      </Button>
      <ErrorNote message={error} />
      <div className="grid gap-2 text-sm">
        <button type="button" onClick={onRecover} className="flex items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-muted/50" data-testid="button-open-recovery">
          <span><span className="font-medium">New device?</span> <span className="text-muted-foreground">Recover with your phrase</span></span><KeyRound className="h-4 w-4 text-muted-foreground" />
        </button>
        <Link href="/sign-in/legacy" className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50" data-testid="link-legacy-sign-in">
          <span><span className="font-medium">Older account?</span> <span className="text-muted-foreground">Sign in to migrate</span></span><ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
      <p className="text-center text-sm text-muted-foreground">New here? <Link href="/sign-up" className="font-medium text-primary hover:underline" data-testid="link-sign-up">Create a VastMind ID</Link></p>
      <MigrationNotice />
    </AccessCard>
  );
}

/* ---------- Recovery ---------- */
export function RecoveryFlow({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = username.trim().replace(/^@/, "").replace(/@vastmind\.com$/i, "");
  const valid = USERNAME_RE.test(handle) && phrase.trim().split(/\s+/).length >= 12;

  async function recover(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const { challengeId, challenge } = await identityRequest<{ challengeId: string; challenge: string }>("recovery-challenges", { username: handle });
      const { signature } = await signAccountRecoveryChallenge(phrase, challenge);
      const { context } = await identityRequest<{ context: string }>("recovery-registration-intents", { challengeId, challenge, signature });
      const res = await vastMindAuthClient.passkey.addPasskey({ context, createSession: true });
      if (res?.error) { setError(res.error.message ?? "The new passkey was not saved."); return; }
      setPhrase("");
      goChats();
    } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  }

  return (
    <AccessCard eyebrow="Recovery" title="Add this device." sub="Your phrase signs a one-time challenge in this browser without being submitted to the server. Recovery adds a passkey; it does not revoke old devices.">
      <form onSubmit={recover} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="recover-username">VastMind ID</Label>
          <Input id="recover-username" autoComplete="username" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} data-testid="input-recovery-username" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recover-phrase">Recovery phrase</Label>
          <Textarea id="recover-phrase" rows={4} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="24 words separated by spaces" value={phrase} onChange={(e) => setPhrase(e.target.value)} className="font-mono text-sm" data-testid="input-recovery-phrase" />
        </div>
        <ErrorNote message={error} />
        <Button type="submit" className="w-full gap-2" disabled={!valid || busy} aria-busy={busy} data-testid="button-recover">
          <Busy busy={busy}>{busy ? "Verifying" : "Verify and create passkey"}</Busy>
        </Button>
      </form>
      <button type="button" onClick={() => { setPhrase(""); onBack(); }} className="w-full text-sm text-muted-foreground hover:text-foreground" data-testid="button-recovery-back">Back to passkey sign-in</button>
    </AccessCard>
  );
}

/* ---------- Sign-up / Clerk enrollment ---------- */
function pickWords(n: number) {
  const idx = new Set<number>();
  while (idx.size < n) idx.add(Math.floor(Math.random() * 24));
  return [...idx].sort((a, b) => a - b);
}

export function SignupFlow({ migrate }: { migrate: boolean }) {
  const { provider, isLoaded } = useAuth();
  const isClerk = provider === "clerk";
  const profile = useGetMyProfile({ query: { enabled: isClerk, queryKey: getGetMyProfileQueryKey() } });
  const prof = profile.data as { name?: string; username?: string } | undefined;
  const [step, setStep] = useState<"details" | "phrase" | "verify">("details");
  const [username, setUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string>("");
  const [backedUp, setBackedUp] = useState(false);
  const [checks, setChecks] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const u = username ?? prof?.username ?? "";
  const n = displayName ?? prof?.name ?? "";
  const words = useMemo(() => phrase.split(" "), [phrase]);
  const detailsValid = USERNAME_RE.test(u) && n.trim().length > 0;
  const wordsOk = checks.length > 0 && checks.every((i) => (answers[i] ?? "").trim().toLowerCase() === words[i]);

  if (!isLoaded) return <AccessCard eyebrow="Create" title="One moment."><div className="h-24 animate-pulse rounded-lg bg-muted" /></AccessCard>;
  if (provider === "vastmind") {
    return (
      <AccessCard eyebrow="Already signed in" title="You have a VastMind ID." sub="There is no need to create another identity. Manage passkeys for this account instead.">
        <Button asChild className="w-full"><Link href="/account-security" data-testid="link-account-security">Open account security</Link></Button>
      </AccessCard>
    );
  }

  function toPhrase() { setPhrase(createRecoveryPhrase()); setBackedUp(false); setStep("phrase"); }
  function toVerify() { setChecks(pickWords(3)); setAnswers({}); setStep("verify"); }

  async function enroll() {
    setBusy(true); setError(null);
    try {
      const recoveryPublicKey = await accountRecoveryPublicKey(phrase);
      const { context } = await identityRequest<{ context: string }>("passkey-registration-intents", { username: u, displayName: n.trim(), recoveryPublicKey });
      const res = await vastMindAuthClient.passkey.addPasskey({ context, createSession: true });
      if (res?.error) { setError(res.error.message ?? "The passkey was not saved."); return; }
      setPhrase("");
      goChats();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  const stepper = (
    <ol className="flex gap-1.5" aria-label="Progress">
      {["details", "phrase", "verify"].map((s, i) => (
        <li key={s} className={`h-1 flex-1 rounded-full ${["details", "phrase", "verify"].indexOf(step) >= i ? "bg-primary" : "bg-muted"}`} />
      ))}
    </ol>
  );

  if (step === "details") return (
    <AccessCard eyebrow={isClerk ? "Move to passkeys" : "Create"} title={isClerk ? "Keep your account, drop the password." : "Claim your VastMind ID."}
      sub={isClerk ? "Your chats, follows and history stay with the same account. Sign in on the web with a passkey while migration continues." : "Pick a handle. No email address or password needed."}>
      {stepper}
      {!isClerk && migrate && <p className="text-sm text-muted-foreground">To move an existing account, <Link href="/sign-in/legacy" className="font-medium text-primary hover:underline">sign in to it first</Link>.</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (detailsValid) toPhrase(); }} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="su-name">Display name</Label>
          <Input id="su-name" value={n} onChange={(e) => setDisplayName(e.target.value)} placeholder="Amara Okafor" maxLength={60} data-testid="input-display-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-username">Username</Label>
          <div className="flex items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
            <Input id="su-username" value={u} onChange={(e) => setUsername(e.target.value.trim())} placeholder="amara_o" autoComplete="username" aria-describedby="su-username-hint" className="border-0 shadow-none focus-visible:ring-0" data-testid="input-username" />
            <span className="pr-3 text-sm text-muted-foreground">@vastmind.com</span>
          </div>
          <p id="su-username-hint" className={`text-xs ${u && !USERNAME_RE.test(u) ? "text-destructive" : "text-muted-foreground"}`}>3 to 32 letters, numbers or underscores.</p>
        </div>
        <Button type="submit" className="w-full" disabled={!detailsValid} data-testid="button-continue-details">Continue</Button>
      </form>
      {!isClerk && <p className="text-center text-sm text-muted-foreground">Already have one? <Link href="/sign-in" className="font-medium text-primary hover:underline">Sign in</Link></p>}
      <MigrationNotice />
    </AccessCard>
  );

  if (step === "phrase") return (
    <AccessCard eyebrow="Recovery phrase" title="Write these 24 words down." sub="This phrase is the only way to add a new device if you lose your passkeys. It is shown once and never leaves this browser.">
      {stepper}
      <ol className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted/60 p-3 font-mono text-sm" data-testid="recovery-phrase-grid">
        {words.map((w, i) => <li key={i} className="flex gap-1.5 rounded-md bg-card px-2 py-1"><span className="w-5 text-right text-muted-foreground">{i + 1}</span>{w}</li>)}
      </ol>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={backedUp} onCheckedChange={(v) => setBackedUp(v === true)} data-testid="checkbox-phrase-backed-up" />
        <span>I wrote this phrase down somewhere safe. VastMind cannot show it again or recover it for me.</span>
      </label>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => { setPhrase(""); setStep("details"); }}>Back</Button>
        <Button className="flex-1" disabled={!backedUp} onClick={toVerify} data-testid="button-confirm-backup">I saved it</Button>
      </div>
    </AccessCard>
  );

  return (
    <AccessCard eyebrow="Check" title="Confirm a few words." sub={`Then save a passkey for ${u}@vastmind.com.`}>
      {stepper}
      <div className="grid gap-3 sm:grid-cols-3">
        {checks.map((i) => (
          <div key={i} className="space-y-1.5">
            <Label htmlFor={`w-${i}`}>Word {i + 1}</Label>
            <Input id={`w-${i}`} autoComplete="off" autoCapitalize="off" spellCheck={false} value={answers[i] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} className="font-mono" data-testid={`input-word-check-${i + 1}`} />
          </div>
        ))}
      </div>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep("phrase")} disabled={busy}>Back</Button>
        <Button className="flex-1 gap-2" disabled={!wordsOk || busy} aria-busy={busy} onClick={enroll} data-testid="button-enroll-passkey">
          <Busy busy={busy}>{busy ? "Saving passkey" : <><ShieldCheck className="h-4 w-4" />Create passkey</>}</Busy>
        </Button>
      </div>
    </AccessCard>
  );
}

/* ---------- Extra passkey (account security) ---------- */
export function AddPasskeyButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function add() {
    setBusy(true); setError(null); setDone(false);
    try {
      const res = await vastMindAuthClient.passkey.addPasskey({ name: "Additional device" });
      if (res?.error) { setError(res.error.message ?? "The passkey was not saved."); return; }
      setDone(true);
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <Button onClick={add} disabled={busy} aria-busy={busy} className="gap-2" data-testid="button-add-passkey">
        <Busy busy={busy}>{busy ? "Waiting for your device" : <><Fingerprint className="h-4 w-4" />Add another passkey</>}</Busy>
      </Button>
      {done && <p role="status" className="text-sm text-primary" data-testid="text-passkey-added">Passkey added. You can now sign in with it.</p>}
      <ErrorNote message={error} />
    </div>
  );
}
