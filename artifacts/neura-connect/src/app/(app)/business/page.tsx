"use client";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, ExternalLink, Inbox, Megaphone, Package, Plus, Settings, ShoppingCart, Ticket, Users, UserSquare2, ArrowUpRight } from "lucide-react";
import {
  useCommerceListShops, getCommerceListShopsQueryKey, useCommerceListProducts, getCommerceListProductsQueryKey,
  type CommerceShop, type CommerceShopRole,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageScroll } from "@/components/page-scroll";
import { ErrorState } from "@/components/states";
import { CreateShopPanel, ShopForm } from "@/components/commerce/seller/shop-form";
import { Catalog } from "@/components/commerce/seller/catalog";
import { Dashboard, SellerOrders } from "@/components/commerce/seller/operations";
import { Campaigns, Coupons, Customers } from "@/components/commerce/seller/marketing";
import { Team } from "@/components/commerce/seller/team";
import { InboxTools } from "@/components/commerce/seller/inbox-tools";
import { Thumb, selectClass } from "@/components/commerce/bits";
import { mediaSrc } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { AlertsButton } from "@/components/shell/alerts-button";

type Tab = "overview" | "catalog" | "orders" | "coupons" | "campaigns" | "customers" | "team" | "settings" | "inbox" | "new";
const TABS: { key: Tab; label: string; icon: typeof BarChart3; roles: CommerceShopRole[] }[] = [
  { key: "overview", label: "Dashboard", icon: BarChart3, roles: ["owner", "manager", "marketer"] },
  { key: "orders", label: "Orders", icon: ShoppingCart, roles: ["owner", "manager", "fulfillment"] },
  { key: "catalog", label: "Catalog", icon: Package, roles: ["owner", "manager"] },
  { key: "coupons", label: "Coupons", icon: Ticket, roles: ["owner", "manager", "marketer"] },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, roles: ["owner", "manager", "marketer", "creator"] },
  { key: "customers", label: "Customers", icon: UserSquare2, roles: ["owner", "manager", "marketer"] },
  { key: "team", label: "Team", icon: Users, roles: ["owner"] },
  { key: "settings", label: "Settings", icon: Settings, roles: ["owner", "manager"] },
];

function SettingsPanel({ shop, onSaved }: { shop: CommerceShop; onSaved: () => void }) {
  const p = { shopId: shop.id };
  const products = useCommerceListProducts(p, { query: { queryKey: getCommerceListProductsQueryKey(p) } });
  if (products.isLoading) return <Skeleton className="h-96 rounded-[1.6rem]" />;
  return <div className="rounded-[1.6rem] border bg-card p-5 sm:p-7"><ShopForm key={shop.id} shop={shop} currencyLocked={!!products.data?.items.length} onSaved={onSaved} /></div>;
}

function SellerCenter() {
  const router = useRouter();
  const sp = useSearchParams();
  const params = { scope: "mine" as const };
  const shops = useCommerceListShops(params, { query: { queryKey: getCommerceListShopsQueryKey(params) } });
  const mine = (shops.data?.items ?? []).filter((s) => s.role !== "buyer");
  const shopParam = sp.get("shop");
  const shop = mine.find((s) => s.id === shopParam) ?? mine[0];
  const tabs = shop ? TABS.filter((t) => t.roles.includes(shop.role)) : [];
  const requested = (sp.get("tab") as Tab) || undefined;
  const tab: Tab = requested === "inbox" || requested === "new" ? requested : tabs.find((t) => t.key === requested)?.key ?? tabs[0]?.key ?? "inbox";
  const go = (q: { shop?: string; tab?: Tab }) => {
    const u = new URLSearchParams();
    const s = q.shop ?? shop?.id; if (s) u.set("shop", s);
    if (q.tab) u.set("tab", q.tab);
    router.replace(`/business?${u}`, { scroll: false });
  };
  useEffect(() => { if (shop && shopParam !== shop.id && requested !== "new") go({ tab }); /* keep URL shareable */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id]);

  if (shops.isLoading) return <PageScroll className="max-w-6xl"><Skeleton className="h-40 rounded-[2rem]" /><div className="mt-4 grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[1.4rem]" />)}</div></PageScroll>;
  if (shops.isError) return <PageScroll className="max-w-6xl"><ErrorState error={shops.error} onRetry={() => shops.refetch()} /></PageScroll>;

  const creating = !shop || tab === "new";
  return <PageScroll className="max-w-6xl">
    <header className="rise relative overflow-hidden rounded-[2rem] bg-[hsl(var(--ink))] p-5 text-[hsl(224_35%_95%)] sm:p-7">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--brand-gradient)" }} />
      <div className="flex flex-wrap items-center gap-4">
        {shop && !creating ? <Thumb src={mediaSrc(shop.logo)} alt="" className="h-14 w-14 rounded-2xl ring-1 ring-white/15" /> : null}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[.24em] text-[hsl(var(--brand-cyan))]">Seller Center{shop && !creating ? ` · ${shop.role}` : ""}</p>
          <h1 className="mt-1 truncate font-display text-3xl font-semibold sm:text-4xl" data-testid="text-seller-title">{creating ? "Open a new shop" : shop.name}</h1>
          {shop && !creating ? <p className="text-xs text-white/60">{shop.isPublished ? "Live" : "Unpublished"} · {shop.currency} · {shop.followerCount} followers</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AlertsButton className="border-white/15 bg-white/10 text-white hover:bg-white/15" />
          {mine.length > 1 ? <select aria-label="Switch shop" className={cn(selectClass, "h-9 w-auto rounded-full border-white/20 bg-white/10 text-white")} value={shop?.id} onChange={(e) => go({ shop: e.target.value })} data-testid="select-shop">{mine.map((s) => <option key={s.id} value={s.id} className="text-foreground">{s.name}</option>)}</select> : null}
          {shop && !creating ? <Button asChild size="sm" variant="outline" className="rounded-full border-white/25 bg-transparent text-white hover:bg-white/10"><Link href={`/shop?shop=${encodeURIComponent(shop.id)}`}><ExternalLink className="mr-1 h-3.5 w-3.5" />View storefront</Link></Button> : null}
          <Button asChild size="sm" variant="outline" className="rounded-full border-white/25 bg-transparent text-white hover:bg-white/10" data-testid="link-business-growth"><Link href="/business/growth"><ArrowUpRight className="mr-1 h-3.5 w-3.5" />Growth</Link></Button>
          {shop && !creating ? <Button size="sm" variant="ghost" className="rounded-full text-white/70 hover:bg-white/10 hover:text-white" onClick={() => go({ tab: "new" })} data-testid="button-new-shop"><Plus className="mr-1 h-3.5 w-3.5" />New shop</Button> : null}
        </div>
      </div>
      <nav className="mt-5 flex gap-1 overflow-x-auto pb-0.5" aria-label="Seller Center sections">
        {[...(creating ? [] : tabs), { key: "inbox" as Tab, label: "Inbox tools", icon: Inbox }].map((t) => { const on = tab === t.key; return <button key={t.key} onClick={() => go({ tab: t.key })} aria-current={on ? "page" : undefined} className={cn("relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-colors", on ? "bg-white/12 text-white" : "text-white/55 hover:text-white")} data-testid={`tab-${t.key}`}><t.icon className="h-4 w-4" />{t.label}{on ? <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full" style={{ background: "var(--brand-gradient)" }} /> : null}</button>; })}
        {creating && shop ? <button onClick={() => go({ tab: undefined })} className="shrink-0 rounded-full px-3.5 py-2 text-sm text-white/55 hover:text-white">Back to {shop.name}</button> : null}
      </nav>
    </header>

    <div key={`${shop?.id}-${tab}`} className="rise mt-6">
      {tab === "inbox" ? <InboxTools />
        : creating ? <CreateShopPanel onCreated={(s) => router.replace(`/business?shop=${encodeURIComponent(s.id)}&tab=catalog`)} />
        : tab === "overview" ? <Dashboard shop={shop} />
        : tab === "orders" ? <SellerOrders shop={shop} />
        : tab === "catalog" ? <Catalog shop={shop} />
        : tab === "coupons" ? <Coupons shop={shop} />
        : tab === "campaigns" ? <Campaigns shop={shop} />
        : tab === "customers" ? <Customers shop={shop} />
        : tab === "team" ? <Team shop={shop} />
        : tab === "settings" ? <SettingsPanel shop={shop} onSaved={() => shops.refetch()} />
        : null}
    </div>
  </PageScroll>;
}

export default function BusinessPage() {
  return <Suspense fallback={<PageScroll className="max-w-6xl"><Skeleton className="h-40 rounded-[2rem]" /></PageScroll>}><SellerCenter /></Suspense>;
}
