import { cn } from "@/lib/utils";
import { basePath } from "@/lib/base";

// The brand artwork comes from the supplied VastMind logo set so web and native stay aligned.
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={`${basePath}/vastmind-mark.png`}
      className={cn("h-9 w-9 select-none object-contain", className)}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src={`${basePath}/vastmind-wordmark.png`}
      className={cn("h-6 w-[142px] select-none object-contain object-left", className)}
      alt="VastMind"
      draggable={false}
    />
  );
}
