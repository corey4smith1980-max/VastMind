import { cn } from "@/lib/utils";
import { basePath } from "@/lib/base";

const icon1 = `${basePath}/brand/icon.png`;
const icon2 = `${basePath}/brand/icon@2x.png`;
const word1 = `${basePath}/brand/wordmark.png`;
const word2 = `${basePath}/brand/wordmark@2x.png`;

/** Original glossy M artwork. */
export function BrandMark({ className, glow = false }: { className?: string; glow?: boolean }) {
  return (
    <img
      src={icon2}
      srcSet={`${icon1} 1x, ${icon2} 2x`}
      className={cn("h-9 w-9 select-none object-contain", glow && "brand-glow", className)}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

/** Original glossy VastMind wordmark. */
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
  const onDark = tone === "onDark";
  return (
    <span className={cn("inline-flex min-w-0 flex-col justify-center", onDark && "brand-on-dark", className)}>
      <img
        src={word2}
        srcSet={`${word1} 1x, ${word2} 2x`}
        alt="VastMind"
        draggable={false}
        className={cn("h-8 w-auto select-none object-contain object-left", onDark && "brand-glow", wordmarkClassName)}
      />
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
      <BrandMark glow={tone === "onDark"} className={markClassName ?? "h-14 w-14"} />
      <Wordmark tagline tone={tone} className={stacked ? "items-center" : undefined} wordmarkClassName={wordmarkClassName} taglineClassName={taglineClassName} />
    </span>
  );
}
