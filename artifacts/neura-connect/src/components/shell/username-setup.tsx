"use client";

import { useState } from "react";
import { ArrowRight, AtSign, Loader2, ShieldCheck } from "lucide-react";
import { useUpdateMyProfile } from "@workspace/api-client-react";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMessage } from "@/lib/format";

const generatedUsername = /^member_[a-f0-9]{24}$/i;

export function UsernameSetup({ name, onComplete }: { name: string; onComplete: () => unknown }) {
  const update = useUpdateMyProfile();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const value = username.trim().toLowerCase();
  const valid = /^[a-z0-9_]{3,32}$/.test(value) && !generatedUsername.test(value);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || update.isPending) return;
    setError("");
    try {
      await update.mutateAsync({ data: { username: value } });
      await onComplete();
    } catch (reason) {
      const message = errMessage(reason);
      setError(/taken|already exists|conflict/i.test(message)
        ? "That username is already taken. Try another."
        : message || "We couldn't save that username. Please try again.");
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-[2rem] border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8">
        <BrandMark className="mb-7 h-11 w-11" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">One-time setup</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Choose your username</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Hi {name || "there"} — choose a unique name people can use to find and mention you.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label htmlFor="new-username" className="text-sm font-medium">Your username</label>
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            <AtSign className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input id="new-username" value={username} onChange={(event) => {
              setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32));
              setError("");
            }} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={32}
              placeholder="yourname" aria-label="Choose a username" aria-invalid={!!error} aria-describedby="username-help username-error"
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" data-testid="input-username-setup" />
          </div>
          <p id="username-help" className="text-xs text-muted-foreground">3–32 lowercase letters, numbers, or underscores. Each username can belong to only one account.</p>
          {error ? <p id="username-error" role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Your username is public. Your email address is not shown on your profile.
          </div>
          <Button type="submit" disabled={!valid || update.isPending} className="w-full rounded-xl" data-testid="button-save-username">
            {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            Continue as @{value || "yourname"}
          </Button>
        </form>
      </section>
    </main>
  );
}
