"use client";
import { SignUp } from "@clerk/react";
import { AuthFrame } from "@/components/auth-frame";
import { basePath } from "@/lib/base";

export default function SignUpPage() {
  return (
    <AuthFrame quote="Start with the people you already know. Everything else can wait.">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/chats`} />
    </AuthFrame>
  );
}
