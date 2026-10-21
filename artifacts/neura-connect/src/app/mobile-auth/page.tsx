"use client";

import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { SignIn } from "@clerk/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/vastmind-auth";
import { useCreateMobileSessionTicket } from "@workspace/api-client-react";
import { AuthFrame } from "@/components/auth-frame";
import { AccessCard, ErrorNote, PasskeySignIn, RecoveryFlow, SignupFlow } from "@/components/vastmind-access";
import { basePath } from "@/lib/base";

type MobileAuthMode = "signin" | "signup" | "recover" | "legacy" | "migrate";

function MobileAuthContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { provider, isLoaded } = useAuth();
  const { mutateAsync: createTicket } = useCreateMobileSessionTicket();
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const completed = useRef(false);
  const mode = (params.get("mode") ?? "signin") as MobileAuthMode;
  const redirectUri = params.get("redirectUri") ?? "";
  const codeChallenge = params.get("codeChallenge") ?? "";
  const state = params.get("state") ?? "";
  let transactionValid = false;
  try {
    const callback = new URL(redirectUri);
    transactionValid = redirectUri.length <= 500 && (
      (callback.protocol === "gather:" && callback.host === "auth" && callback.pathname === "/callback")
      || (callback.protocol === "exp:" && callback.pathname === "/--/auth/callback")
    );
  } catch {
    transactionValid = false;
  }
  const transactionReady = transactionValid
    && /^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
    && /^[0-9a-f-]{36}$/i.test(state);

  const changeMode = useCallback((next: MobileAuthMode) => {
    const nextParams = new URLSearchParams(params.toString());
    nextParams.set("mode", next);
    router.replace(`/mobile-auth?${nextParams.toString()}`);
  }, [params, router]);

  const completeMobileSignIn = useCallback(async () => {
    if (!transactionReady || completed.current || completing) {
      if (!transactionReady) setError("This mobile sign-in link is incomplete. Return to the app and try again.");
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      const result = await createTicket({
        data: { codeChallenge, redirectUri, state },
      });
      const callback = new URL(redirectUri);
      callback.searchParams.set("ticket", result.ticket);
      callback.searchParams.set("state", state);
      completed.current = true;
      window.location.assign(callback.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to return to the mobile app. Try again.");
    } finally {
      setCompleting(false);
    }
  }, [codeChallenge, completing, createTicket, redirectUri, state, transactionReady]);

  const migrateUrl = useMemo(() => {
    const nextParams = new URLSearchParams(params.toString());
    nextParams.set("mode", "migrate");
    return `${basePath}/mobile-auth?${nextParams.toString()}`;
  }, [params]);

  if (!transactionReady) {
    return <AuthFrame quote="Sign in once. Continue on every device.">
      <AccessCard eyebrow="Mobile sign-in" title="Open VastMind from the app." sub="This page needs a secure sign-in request from your VastMind mobile app.">
        <ErrorNote message="Return to the app and start sign-in again." />
      </AccessCard>
    </AuthFrame>;
  }
  if (!isLoaded) {
    return <AuthFrame quote="Sign in once. Continue on every device.">
      <AccessCard eyebrow="Mobile sign-in" title="Checking your account.">
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
      </AccessCard>
    </AuthFrame>;
  }

  if ((mode === "legacy" || mode === "migrate") && provider !== "clerk") {
    if (mode === "legacy") {
      return <AuthFrame quote="Keep your account and move to VastMind sign-in.">
        <div className="w-full max-w-md rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
          <p className="mb-4 text-sm text-muted-foreground">Sign in to your existing account, then add a passkey and recovery phrase. Your profile and social data stay with the same account.</p>
          <SignIn
            routing="path"
            path={`${basePath}/mobile-auth`}
            signUpUrl={`${basePath}/sign-up?migrate=1`}
            forceRedirectUrl={migrateUrl}
            fallbackRedirectUrl={migrateUrl}
          />
        </div>
      </AuthFrame>;
    }
    return <AuthFrame quote="Keep your account and move to VastMind sign-in.">
      <AccessCard eyebrow="Account migration" title="Sign in to your older account." sub="After the existing account is verified, create a VastMind passkey without changing its profile or social data.">
        <button type="button" onClick={() => changeMode("legacy")} className="w-full rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted/50">Continue to existing-account sign-in</button>
        <ErrorNote message={error} />
      </AccessCard>
    </AuthFrame>;
  }

  if (provider === "vastmind") {
    return <AuthFrame quote="Sign in once. Continue on every device.">
      <AccessCard eyebrow="Mobile sign-in" title={completing ? "Returning to the app…" : "Sign-in is ready."}>
        <button type="button" disabled={completing} onClick={() => void completeMobileSignIn()} className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-60">
          {completing ? "Returning to the app…" : "Continue to the mobile app"}
        </button>
        <ErrorNote message={error} />
      </AccessCard>
    </AuthFrame>;
  }

  const migrationMode = mode === "migrate" || provider === "clerk" || params.get("migrate") === "1";
  return <AuthFrame quote="Your account. Your passkey. Every device.">
    {mode === "recover"
      ? <RecoveryFlow onBack={() => changeMode("signin")} onSuccess={completeMobileSignIn} />
      : mode === "signup" || migrationMode
        ? <SignupFlow migrate={migrationMode} onSignIn={() => changeMode("signin")} onSuccess={completeMobileSignIn} />
        : <PasskeySignIn
          onRecover={() => changeMode("recover")}
          onSuccess={completeMobileSignIn}
          onSignup={() => changeMode("signup")}
          onLegacy={() => changeMode("legacy")}
        />}
    <div aria-live="polite" className="sr-only">{completing ? "Returning to the mobile app" : ""}</div>
    <ErrorNote message={error} />
  </AuthFrame>;
}

export default function MobileAuthPage() {
  return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-background"><div className="h-10 w-10 animate-pulse rounded-full bg-primary/20" /></div>}>
    <MobileAuthContent />
  </Suspense>;
}
