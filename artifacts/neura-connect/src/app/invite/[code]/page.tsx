"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/vastmind-auth";
import { Link2, Loader2 } from "lucide-react";
import { useAcceptChatInvite } from "@workspace/api-client-react";
import { BrandMark, Wordmark } from "@/components/brand";
import { BootScreen } from "@/components/states";
import { Button } from "@/components/ui/button";
import { basePath } from "@/lib/base";
import { errMessage } from "@/lib/format";
import { useInvalidate } from "@/lib/realtime";

// ---------- Invite landing: accept a group invite code ----------
export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const invalidate = useInvalidate();
  const accept = useAcceptChatInvite({
    mutation: {
      onSuccess: (conv) => {
        invalidate("/api/chats");
        router.push(`/chats?c=${conv.id}`);
      },
    },
  });

  if (!isLoaded) return <BootScreen />;
  const back = encodeURIComponent(`${window.location.origin}${basePath}/invite/${code}`);

  return (
    <div className="switchboard-bg flex min-h-[100dvh] items-center justify-center px-4">
      <div className="rise w-full max-w-md rounded-[2rem] border bg-card p-8 text-center shadow-[0_30px_80px_-40px_hsl(var(--ink)/.5)]">
        <div className="flex items-center justify-center gap-2"><BrandMark className="h-8 w-8" /><Wordmark /></div>
        <div className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/30"><Link2 className="h-6 w-6 text-primary" /></div>
        <h1 className="font-display mt-5 text-3xl font-bold">You've been patched in.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Someone shared a group invite with you. Code <span className="font-mono text-foreground">{code}</span></p>
        {isSignedIn ? (
          <>
            <Button className="mt-7 w-full rounded-full" size="lg" disabled={accept.isPending} onClick={() => accept.mutate({ inviteCode: code })} data-testid="button-accept-invite">
              {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Join the conversation
            </Button>
            {accept.isError ? <p className="mt-3 text-sm text-destructive" role="alert">{errMessage(accept.error)}</p> : null}
            <Link href="/chats" className="mt-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">Not now</Link>
          </>
        ) : (
          <div className="mt-7 grid gap-2">
            <Button asChild size="lg" className="rounded-full"><Link href={`/sign-in?redirect_url=${back}`}>Sign in to join</Link></Button>
            <Button asChild size="lg" variant="outline" className="rounded-full"><Link href={`/sign-up?redirect_url=${back}`}>Create an account</Link></Button>
          </div>
        )}
      </div>
    </div>
  );
}
