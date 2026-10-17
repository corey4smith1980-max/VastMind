"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/react";
import { Landing } from "@/components/landing/landing";
import { BootScreen } from "@/components/states";

// Public home: landing for visitors, straight into /chats for signed-in members.
export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace("/chats");
  }, [isLoaded, isSignedIn, router]);
  if (!isLoaded || isSignedIn) return <BootScreen />;
  return <Landing />;
}
