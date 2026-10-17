"use client";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { BootScreen } from "@/components/states";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<BootScreen />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
