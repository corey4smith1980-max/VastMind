"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { useIsOnline } from "@/lib/realtime";
import { cn } from "@/lib/utils";

// Deterministic warm hue per person so initials avatars feel personal, not gray.
const HUES = ["12 80% 88%", "42 90% 82%", "168 40% 82%", "192 40% 84%", "340 55% 88%", "88 45% 82%"];
function hueFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function UserAvatar({
  id, name, src, online, size = "md", group, className,
}: {
  id?: string; name?: string | null; src?: string | null; online?: boolean;
  size?: "sm" | "md" | "lg" | "xl"; group?: boolean; className?: string;
}) {
  const live = useIsOnline(id, online ?? false);
  const dims = { sm: "h-8 w-8 text-[11px]", md: "h-11 w-11 text-sm", lg: "h-14 w-14 text-base", xl: "h-20 w-20 text-xl" }[size];
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className={cn(dims, group ? "rounded-2xl" : "rounded-full")}>
        {src ? <AvatarImage src={src} alt={name ?? ""} /> : null}
        <AvatarFallback
          className={cn("font-semibold text-[hsl(var(--ink))]", group ? "rounded-2xl" : "rounded-full")}
          style={{ background: `hsl(${hueFor(id ?? name ?? "x")})` }}
        >
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      {online !== undefined && live ? (
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-online"
          aria-label="Online"
          data-testid={`status-online-${id}`}
        />
      ) : null}
    </span>
  );
}
