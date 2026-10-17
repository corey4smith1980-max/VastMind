"use client";
import { ErrorState } from "@/components/states";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <ErrorState error={error} title="Something snapped" onRetry={reset} />
    </div>
  );
}
