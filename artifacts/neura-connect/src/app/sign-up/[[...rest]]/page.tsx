"use client";
import { useSearchParams } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { SignupFlow } from "@/components/vastmind-access";

export default function SignUpPage() {
  const migrate = useSearchParams()?.get("migrate") === "1";
  return (
    <AuthFrame quote="Start with the people you already know. Everything else can wait.">
      <SignupFlow migrate={migrate} />
    </AuthFrame>
  );
}
