"use client";
import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { AddPasskeyButton, MigrationNotice } from "@/components/vastmind-access";
import { SessionManager } from "@/components/vastmind-access/session-manager";
import { useAuth } from "@/lib/vastmind-auth";
import { useMe } from "@/lib/me";

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
          <p className="mt-1 text-sm text-muted-foreground">Signed in with {provider === "vastmind" ? "a passkey" : "the legacy sign-in"}.</p>
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
        <SessionManager />
        <MigrationNotice />
      </div>
    </PageScroll>
  );
}
