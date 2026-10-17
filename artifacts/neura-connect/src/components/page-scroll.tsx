import { cn } from "@/lib/utils";

// Scroll container for non-chat pages (the shell itself is fixed height).
export function PageScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className={cn("mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10", className)}>{children}</div>
    </div>
  );
}
