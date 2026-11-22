"use client";
import Link from "next/link";
import { BrandLockup, BrandMark, Wordmark } from "@/components/brand";
import { basePath } from "@/lib/base";

// Shared two-panel frame for sign-in / sign-up: illustration left, Clerk card right.
export function AuthFrame({ children, quote }: { children: React.ReactNode; quote: string }) {
  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar lg:block">
        <img src={`${basePath}/hero-switchboard.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--ink))] via-[hsl(var(--ink)/0.35)] to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <Link href="/" className="flex items-center gap-3"><BrandLockup tone="onDark" markClassName="h-12 w-12" taglineClassName="text-[0.68rem] text-white" /></Link>
          <p className="font-display max-w-md text-4xl font-semibold leading-tight">{quote}</p>
        </div>
      </aside>
      <section className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <Link href="/" className="flex items-center gap-2 lg:hidden"><BrandMark className="h-10 w-10" /><Wordmark tagline taglineClassName="text-[0.62rem]" /></Link>
        {children}
      </section>
    </div>
  );
}
