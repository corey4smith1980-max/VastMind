"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/vastmind-auth";
import {
  Bell, Briefcase, CircleDashed, House, MessagesSquare, Menu, Newspaper, Radio, Settings, ShoppingBag, Fingerprint,
} from "lucide-react";
import { useGetMyProfile, useListNotifications, useListChats, getGetMyProfileQueryKey, getListNotificationsQueryKey, getListChatsQueryKey } from "@workspace/api-client-react";
import { BrandMark } from "@/components/brand";
import { BootScreen, ErrorState } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { ConnectionPill } from "@/components/shell/connection-pill";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MeContext } from "@/lib/me";
import { CallProvider } from "@/components/calling/call-provider";
import { usePollInterval } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { UsernameSetup } from "@/components/shell/username-setup";

// ---------- Navigation model ----------
const NAV = [
  { href: "/chats", label: "Chats", detail: "Messages and calls", icon: MessagesSquare },
  { href: "/videos", label: "Feed", detail: "Posts and short videos", icon: Newspaper },
  { href: "/statuses", label: "Status", detail: "Moments that expire", icon: CircleDashed },
  { href: "/home", label: "Home", detail: "Posts and updates", icon: House },
  { href: "/channels", label: "Channels", detail: "Updates you follow", icon: Radio },
  { href: "/shop", label: "Shop", detail: "Discover products and sellers", icon: ShoppingBag },
  { href: "/business", label: "Business", detail: "Shop and customer tools", icon: Briefcase },
  { href: "/notifications", label: "Alerts", detail: "Important activity", icon: Bell },
  { href: "/account-security", label: "VastMind ID", detail: "Sign-in and recovery", icon: Fingerprint },
  { href: "/settings", label: "Settings", detail: "Privacy and preferences", icon: Settings },
];
const NAV_SECTIONS = [
  { label: "Your space", hrefs: ["/chats", "/videos", "/home", "/statuses"] },
  { label: "Channels", hrefs: ["/channels"] },
  { label: "Business", hrefs: ["/shop", "/business"] },
  { label: "Account", hrefs: ["/notifications", "/account-security", "/settings"] },
] as const;
// Keep the mobile dock focused, with the Shop action in the center position.
const MOBILE_PRIMARY_HREFS = ["/chats", "/videos", "/shop", "/home"] as const;
const MOBILE_PRIMARY_SET = new Set<string>(MOBILE_PRIMARY_HREFS);

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
        {/* ---------- Desktop navigation ---------- */}
        <nav aria-label="Main" className="hidden w-[248px] shrink-0 flex-col border-r bg-sidebar px-3 py-5 text-sidebar-foreground md:flex">
          <Link href="/home" aria-label="VastMind home" className="mb-6 flex items-center gap-3 rounded-2xl px-3 py-2">
            <BrandMark className="h-9 w-9 shrink-0" />
            <span className="font-display text-lg font-semibold tracking-tight">VastMind</span>
          </Link>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4">
            <section aria-label="Daily use">
              <h2 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/45">Daily use</h2>
              <div className="space-y-1">
                {MOBILE_PRIMARY_HREFS.map((href) => {
                  const n = NAV.find((item) => item.href === href);
                  if (!n) return null;
                  const selected = active(n.href);
                  return (
                    <Link key={n.href} href={n.href} aria-current={selected ? "page" : undefined}
                      data-testid={`link-nav-${n.label.toLowerCase()}`}
                      className={cn(
                        "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                        selected ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      )}>
                      <n.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="flex-1">{n.label}</span>
                      <Badge n={badgeFor(n.href)} />
                    </Link>
                  );
                })}
              </div>
            </section>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="More navigation" data-testid="button-desktop-nav-more"
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
                  <span className="relative grid h-[18px] w-[18px] place-items-center"><Menu className="h-[18px] w-[18px]" /><Badge n={unreadNotes} /></span>
                  More
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-64">
                {NAV_SECTIONS.map((section) => {
                  const items = section.hrefs
                    .filter((href) => !MOBILE_PRIMARY_SET.has(href))
                    .map((href) => NAV.find((item) => item.href === href))
                    .filter((item): item is (typeof NAV)[number] => !!item);
                  if (!items.length) return null;
                  return (
                    <div key={section.label}>
                      <DropdownMenuLabel className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{section.label}</DropdownMenuLabel>
                      {items.map((n) => (
                        <DropdownMenuItem key={n.href} onSelect={() => router.push(n.href)} data-testid={`more-nav-${n.label.toLowerCase()}`}>
                          <n.icon className="h-4 w-4" />
                          <span className="flex-1">{n.label}</span>
                          {badgeFor(n.href) > 0 ? <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">{badgeFor(n.href)}</span> : null}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-3 border-t border-sidebar-foreground/10 px-2 pt-4">
            <Link href="/settings" aria-label="Your profile" className="shrink-0">
              <UserAvatar id={me.data.id} name={me.data.name} src={me.data.avatarUrl} size="md" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{me.data.name}</p>
              <ConnectionPill compact className="mt-1 text-sidebar-foreground/60" />
            </div>
            <Link href="/settings" aria-label="Open settings" className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </nav>

        {/* ---------- Page ---------- */}
        <main className={cn("relative flex min-w-0 flex-1 flex-col overflow-hidden", !inChat && "pb-[92px] md:pb-0")}>{children}</main>

        {/* ---------- Mobile bottom bar ---------- */}
        <nav aria-label="Main" className={cn("fixed inset-x-0 bottom-3 z-40 px-3 pb-[env(safe-area-inset-bottom)] md:hidden", inChat && "hidden")}>
          <div className="mx-auto flex max-w-lg items-stretch gap-0.5 rounded-[1.65rem] border bg-card/95 p-1.5 shadow-[0_12px_40px_-18px_hsl(var(--ink)/.55)] backdrop-blur">
            {MOBILE_PRIMARY_HREFS.map((href) => {
              const n = NAV.find((item) => item.href === href);
              if (!n) return null;
              const selected = active(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={selected ? "page" : undefined}
                  className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold", selected ? "text-primary" : "text-muted-foreground")}>
                  <span className={cn("relative grid h-8 w-9 place-items-center rounded-full", n.href === "/shop" && (selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"))}>
                    <n.icon className="h-[18px] w-[18px]" /><Badge n={badgeFor(n.href)} />
                  </span>
                  <span className="truncate">{n.label}</span>
                </Link>
              );
            })}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button aria-label="More navigation" className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold", moreOpen ? "bg-muted text-foreground" : "text-muted-foreground")} data-testid="button-nav-more">
                  <span className="relative grid h-8 w-9 place-items-center"><Menu className="h-[18px] w-[18px]" /><Badge n={unreadNotes} /></span><span>More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[82dvh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <SheetHeader className="px-1"><SheetTitle className="font-display">Explore VastMind</SheetTitle></SheetHeader>
                <div className="space-y-5 px-4 pt-4">
                  {NAV_SECTIONS.map((section) => {
                    const items = section.hrefs
                      .filter((href) => !MOBILE_PRIMARY_SET.has(href))
                      .map((href) => NAV.find((item) => item.href === href))
                      .filter((item): item is (typeof NAV)[number] => !!item);
                    if (!items.length) return null;
                    return (
                      <section key={section.label} aria-label={section.label}>
                        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{section.label}</h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {items.map((n) => (
                            <Link key={n.href} href={n.href} className={cn(
                              "flex min-h-[62px] items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-muted/50",
                              active(n.href) && "border-primary/50 bg-primary/5 text-primary",
                            )}>
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted/70"><n.icon className="h-[18px] w-[18px]" /></span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold">{n.label}</span>
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.detail}</span>
                              </span>
                              {badgeFor(n.href) ? <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] text-primary-foreground">{badgeFor(n.href)}</span> : null}
                            </Link>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <div className="flex justify-center py-4"><ConnectionPill /></div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </div>
    </CallProvider></MeContext.Provider>
  );
}
