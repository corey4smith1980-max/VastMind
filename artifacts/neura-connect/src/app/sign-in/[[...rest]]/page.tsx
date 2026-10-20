"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SignIn } from "@clerk/react";
import { AuthFrame } from "@/components/auth-frame";
import { PasskeySignIn, RecoveryFlow } from "@/components/vastmind-access";
import { basePath } from "@/lib/base";

export default function SignInPage() {
  const params = useParams<{ rest?: string[] }>();
  const legacy = params?.rest?.[0] === "legacy";
  const [recover, setRecover] = useState(false);

  if (legacy) {
    return (
      <AuthFrame quote="Bring your account along. Same chats, same people, a passkey instead of a password.">
        <div className="w-full max-w-md rounded-xl border border-dashed bg-muted/40 p-4 text-sm">
          <p className="font-medium">Temporary migration sign-in</p>
          <p className="mt-1 text-muted-foreground">For existing accounts only. After signing in you will set up a passkey for the same account. <Link href="/sign-in" className="text-primary hover:underline">Use passkey instead</Link></p>
        </div>
        {/* path must be the full browser path; Clerk reads window.location.pathname directly */}
        <SignIn routing="path" path={`${basePath}/sign-in/legacy`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/sign-up?migrate=1`} />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame quote="The group chat, the block association and the bakery down the road, on one line.">
      {recover ? <RecoveryFlow onBack={() => setRecover(false)} /> : <PasskeySignIn onRecover={() => setRecover(true)} />}
    </AuthFrame>
  );
}
