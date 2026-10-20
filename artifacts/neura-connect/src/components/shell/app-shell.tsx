"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/react";
import {
  Bell, Briefcase, CircleDashed, Clapperboard, MessagesSquare, Menu, Newspaper, Radio, Settings, ShoppingBag, UsersRound,
} from "lucide-react";
import { useGetMyProfile, useListNotifications, useListChats, getGetMyProfileQueryKey, getListNotificationsQueryKey, getListChatsQueryKey } from "@workspace/api-client-react";
import { BrandMark } from "@/components/brand";
import { BootScreen, ErrorState } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { ConnectionPill } from "@/components/shell/connection-pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MeContext } from "@/lib/me";
import { CallProvider } from "@/components/calling/call-provider";
import { usePollInterval } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { UsernameSetup } from "@/components/shell/username-setup";

// ---------- Navigation model ----------
const NAV = [
  { href: "/chats", label: "Chats", icon: MessagesSquare, primary: true },
  { href: "/feed", label: "Feed", icon: Newspaper, primary: true },
  { href: "/videos", label: "Videos", icon: Clapperboard, primary: true },
  { href: "/statuses", label: "Status", icon: CircleDashed, primary: true },
  { href: "/communities", label: "Communities", icon: UsersRound, primary: true },
  { href: "/channels", label: "Channels", icon: Radio },
  { href: "/business", label: "Business", icon: Briefcase },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/notifications", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-primary px-1 text-center font-mono text-[10px] font-bold leading-[18px] text-primary-foreground">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);

  // Auth guard: signed-out visitors go back to the public landing page.
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/");
  }, [isLoaded, isSignedIn, router]);

  const enabled = isLoaded && !!isSignedIn;
  const poll = usePollInterval(30_000);
  const me = useGetMyProfile({ query: { enabled, queryKey: getGetMyProfileQueryKey() } });
  const needsUsername = !me.data?.username || /^member_[a-f0-9]{24}$/i.test(me.data.username);
  const appReady = enabled && !!me.data && !needsUsername;
  const notes = useListNotifications({ query: { enabled: appReady, queryKey: getListNotificationsQueryKey(), refetchInterval: poll } });
  const chats = useListChats(undefined, { query: { enabled: appReady, queryKey: getListChatsQueryKey(), refetchInterval: poll } });

  useEffect(() => setMoreOpen(false), [pathname]);

  if (!isLoaded || !isSignedIn || me.isLoading) return <BootScreen />;
  if (me.isError || !me.data) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <ErrorState error={me.error} title="We couldn't load your profile" onRetry={() => me.refetch()} />
      </div>
    );
  }
  if (needsUsername) return <UsernameSetup name={me.data.name} onComplete={() => me.refetch()} />;

  const unreadNotes = (notes.data ?? []).filter((n) => !n.read).length;
  const unreadChats = (chats.data ?? []).reduce((s, c) => s + c.unreadCount, 0);
  const badgeFor = (href: string) => (href === "/chats" ? unreadChats : href === "/notifications" ? unreadNotes : 0);
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const inChat = pathname.startsWith("/chats") && search.has("c");

  return (
    <MeContext.Provider value={me.data}><CallProvider>
      <div className="flex h-[100dvh] overflow-hidden bg-background">
        {/* ---------- Desktop rail ---------- */}
        <nav aria-label="Main" className="hidden w-[76px] shrink-0 flex-col items-center gap-1 bg-sidebar py-4 text-sidebar-foreground md:flex">
          <Link href="/chats" aria-label="Home" className="mb-4"><BrandMark className="h-10 w-10" /></Link>
          {NAV.map((n) => (
            <Tooltip key={n.href}>
              <TooltipTrigger asChild>
                <Link
                  href={n.href}
                  aria-label={n.label}
                  aria-current={active(n.href) ? "page" : undefined}
                  data-testid={`link-nav-${n.label.toLowerCase()}`}
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200",
                    active(n.href) ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_8px_20px_-8px_hsl(var(--sidebar-primary))]" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <n.icon className="h-5 w-5" />
                  <Badge n={badgeFor(n.href)} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{n.label}</TooltipContent>
            </Tooltip>
          ))}
          <div className="mt-auto flex flex-col items-center gap-3">
            <ConnectionPill compact className="text-sidebar-foreground/70" />
            <Link href="/settings" aria-label="Your profile">
              <UserAvatar id={me.data.id} name={me.data.name} src={me.data.avatarUrl} size="md" />
            </Link>
          </div>
        </nav>

        {/* ---------- Page ---------- */}
        <main className={cn("relative flex min-w-0 flex-1 flex-col overflow-hidden", !inChat && "pb-[68px] md:pb-0")}>{children}</main>

        {/* ---------- Mobile bottom bar ---------- */}
        <nav aria-label="Main" className={cn("fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden", inChat && "hidden")}>
          <div className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
            {NAV.filter((n) => n.primary).map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
                className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", active(n.href) ? "text-primary" : "text-muted-foreground")}>
                <span className="relative"><n.icon className="h-5 w-5" /><Badge n={badgeFor(n.href)} /></span>
                {n.label}
              </Link>
            ))}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground" data-testid="button-nav-more">
                  <span className="relative"><Menu className="h-5 w-5" /><Badge n={unreadNotes} /></span>More
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-3xl">
                <SheetHeader><SheetTitle className="font-display">Everything else</SheetTitle></SheetHeader>
                <div className="grid grid-cols-2 gap-2 p-4">
                  {NAV.filter((n) => !n.primary).map((n) => (
                    <Link key={n.href} href={n.href} className={cn("relative flex items-center gap-3 rounded-2xl border p-4 text-sm font-medium", active(n.href) && "border-primary text-primary")}>
                      <n.icon className="h-5 w-5" />{n.label}
                      {badgeFor(n.href) ? <span className="ml-auto rounded-full bg-primary px-2 font-mono text-[10px] text-primary-foreground">{badgeFor(n.href)}</span> : null}
                    </Link>
                  ))}
                </div>
                <div className="flex justify-center pb-4"><ConnectionPill /></div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </div>
    </CallProvider></MeContext.Provider>
  );
}
