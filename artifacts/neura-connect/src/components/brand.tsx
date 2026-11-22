import { cn } from "@/lib/utils";
import { basePath } from "@/lib/base";

/** Crisp vector M: cyan-to-violet ribbon with the center sphere. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={`${basePath}/brand-mark.svg`}
      className={cn("h-9 w-9 select-none object-contain", className)}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function Wordmark({
  className,
  wordmarkClassName,
  tagline = false,
  taglineClassName,
  tone = "onLight",
}: {
  className?: string;
  wordmarkClassName?: string;
  tagline?: boolean;
  taglineClassName?: string;
  tone?: "onLight" | "onDark";
}) {
  return (
    <span className={cn("inline-flex min-w-0 flex-col justify-center", tone === "onDark" && "brand-on-dark", className)}>
      <span className={cn("brand-wordmark text-[1.45rem] leading-none", wordmarkClassName)}>VastMind</span>
      {tagline ? <span className={cn("brand-tagline", taglineClassName)}>ALL YOUR SOCIALS • ONE MIND</span> : null}
    </span>
  );
}

export function BrandLockup({
  className,
  markClassName,
  stacked = false,
  tone = "onLight",
  wordmarkClassName,
  taglineClassName,
}: {
  className?: string;
  markClassName?: string;
  stacked?: boolean;
  tone?: "onLight" | "onDark";
  wordmarkClassName?: string;
  taglineClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", stacked && "flex-col gap-5 text-center", className)}>
      <BrandMark className={markClassName ?? "h-14 w-14"} />
      <Wordmark tagline tone={tone} className={stacked ? "items-center" : undefined} wordmarkClassName={wordmarkClassName} taglineClassName={taglineClassName} />
    </span>
  );
}
