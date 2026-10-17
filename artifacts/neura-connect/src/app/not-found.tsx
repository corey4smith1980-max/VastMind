"use client";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="switchboard-bg flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <BrandMark className="h-12 w-12" />
      <p className="mt-8 font-mono text-xs uppercase tracking-[0.3em] text-primary">Error 404 · no answer</p>
      <h1 className="font-display mt-3 text-5xl font-bold">Wrong extension.</h1>
      <p className="mt-3 max-w-sm text-muted-foreground">That page isn't wired to anything. Let's patch you back to somewhere useful.</p>
      <Button asChild className="mt-8 rounded-full px-6"><Link href="/" data-testid="link-home">Back to the switchboard</Link></Button>
    </div>
  );
}
