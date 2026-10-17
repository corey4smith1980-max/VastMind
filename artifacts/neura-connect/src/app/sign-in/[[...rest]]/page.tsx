"use client";
import { SignIn } from "@clerk/react";
import { AuthFrame } from "@/components/auth-frame";
import { basePath } from "@/lib/base";

export default function SignInPage() {
  return (
    <AuthFrame quote="The group chat, the block association and the bakery down the road — on one line.">
      {/* path must be the full browser path — Clerk reads window.location.pathname directly */}
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/chats`} />
    </AuthFrame>
  );
}
