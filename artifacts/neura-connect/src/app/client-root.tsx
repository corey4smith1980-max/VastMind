"use client";
// Client-only boundary: Clerk's browser SDK reads window at module load,
// so the whole provider tree is loaded with ssr:false.
import dynamic from "next/dynamic";
import { BootScreen } from "@/components/states";

const Providers = dynamic(() => import("@/components/providers"), {
  ssr: false,
  loading: () => <BootScreen />,
});

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
