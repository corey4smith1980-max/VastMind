"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bell, BellOff, Bookmark, Copy, Flag, Package, Search, ShoppingBag, SlidersHorizontal, Store, Ticket, Users } from "lucide-react";
import {
  useCommerceListProducts, getCommerceListProductsQueryKey, useCommerceListShops, getCommerceListShopsQueryKey,
  useCommerceGetShop, getCommerceGetShopQueryKey, useCommerceFollowShop, useCommerceListOrders, getCommerceListOrdersQueryKey,
  useCommerceGetCampaign, getCommerceGetCampaignQueryKey, useCommerceRecordEvent,
  type CommerceListOrdersStatus, type CommerceListProductsParams, type CommerceListProductsSort, type CommerceProduct, type CommerceShop,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { PageScroll } from "@/components/page-scroll";
import { EmptyState, ErrorState } from "@/components/states";
import { ProductDetail, ReportDialog } from "@/components/commerce/product-detail";
import { Checkout } from "@/components/commerce/checkout";
import { OrderCard } from "@/components/commerce/order-card";
import { Kicker, Pager, Stars, Thumb, selectClass } from "@/components/commerce/bits";
import { useMe } from "@/lib/me";
import { useToast } from "@/hooks/use-toast";
import { useInvalidate, usePollInterval } from "@/lib/realtime";
import { errMessage } from "@/lib/format";
import { mediaSrc, money, toMinor, useCart, validCurrency, ORDER_STATUS_LABEL } from "@/lib/commerce";
import { cn } from "@/lib/utils";

type View = "discover" | "shops" | "saved" | "orders" | "cart";
const VIEWS: [View, string][] = [["discover", "Discover"], ["shops", "Shops"], ["saved", "Saved"], ["orders", "My orders"], ["cart", "Cart"]];

function useDebounced(value: string, ms = 280) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value.trim()), ms); return () => window.clearTimeout(t); }, [value, ms]);
  return v;
}

function ProductCard({ p, onOpen, i }: { p: CommerceProduct; onOpen: () => void; i: number }) {
  const stock = p.variants.length ? p.variants.reduce((s, v) => s + v.inventory, 0) : p.inventory;
  const from = p.variants.length ? Math.min(...p.variants.map((v) => v.priceMinor)) : p.priceMinor;
  return <button type="button" onClick={onOpen} className="rise group block w-full overflow-hidden rounded-[1.6rem] border bg-card text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-30px_hsl(var(--brand-blue)/.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }} data-testid={`card-product-${p.id}`}>
    <div className="relative overflow-hidden">
      <Thumb src={mediaSrc(p.gallery[0])} alt={p.title} className="aspect-[4/5] w-full transition-transform duration-500 group-hover:scale-[1.04]" />
      {stock === 0 ? <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold">Sold out</span> : null}
      {p.saved ? <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-background/90 text-primary" aria-label="Saved"><Bookmark className="h-3.5 w-3.5 fill-current" /></span> : null}
    </div>
    <div className="p-3.5">
      <p className="truncate text-[11px] text-muted-foreground">{p.shopName || p.sellerName}</p>
      <h3 className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">{p.title}</h3>
      <div className="mt-2 flex items-center justify-between gap-2"><span className="font-display text-lg font-bold tabular-nums">{p.variants.length > 1 ? <span className="mr-1 text-[10px] font-normal text-muted-foreground">from</span> : null}{money(from, p.currency)}</span>{p.reviewCount ? <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Stars value={p.rating} size="h-3 w-3" />{p.reviewCount}</span> : null}</div>
    </div>
  </button>;
}

function ProductGrid({ params, onOpen, empty }: { params: CommerceListProductsParams; onOpen: (p: CommerceProduct) => void; empty: React.ReactNode }) {
  const [stack, setStack] = useState<string[]>([]);
  const sig = JSON.stringify(params);
  useEffect(() => setStack([]), [sig]);
  const full = { ...params, ...(stack.length ? { cursor: stack[stack.length - 1] } : {}) };
  const q = useCommerceListProducts(full, { query: { queryKey: getCommerceListProductsQueryKey(full), placeholderData: (prev) => prev } });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="aspect-[4/5] rounded-[1.6rem]" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/3" /></div>)}</div>;
  if (!q.data?.items.length) return <>{empty}</>;
  return <div className={cn("transition-opacity", q.isFetching && "opacity-70")}>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{q.data.items.map((p, i) => <ProductCard key={p.id} p={p} i={i} onOpen={() => onOpen(p)} />)}</div>
    <Pager stack={stack} next={q.data.nextCursor} onChange={setStack} label="Products" />
  </div>;
}

function FollowControls({ shop }: { shop: CommerceShop }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const follow = useCommerceFollowShop({ mutation: {
    onSuccess: (s) => { invalidate("/api/commerce/shops"); toast({ title: s.following ? `Following ${s.name}` : `Unfollowed ${s.name}`, description: s.following ? (s.marketingOptIn ? "You'll get offers from this shop." : "Shop updates only; no offers.") : undefined }); },
    onError: (e) => toast({ title: "Couldn't update follow", description: errMessage(e), variant: "destructive" }),
  } });
  if (shop.role !== "buyer") return <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium capitalize">You are {shop.role}</span>;
  return <div className="flex flex-wrap items-center gap-3">
    <Button className={cn("rounded-full", shop.following && "bg-white/15 text-white hover:bg-white/25")} disabled={follow.isPending} onClick={() => follow.mutate({ shopId: shop.id, data: { following: !shop.following, marketingOptIn: shop.following ? false : shop.marketingOptIn } })} data-testid="button-follow-shop">{shop.following ? "Following" : "Follow shop"}</Button>
    {shop.following ? <label className="flex items-center gap-2 text-xs text-white/80">{shop.marketingOptIn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}Offers and coupons
      <Switch checked={shop.marketingOptIn} disabled={follow.isPending} onCheckedChange={(v) => follow.mutate({ shopId: shop.id, data: { following: true, marketingOptIn: v } })} aria-label="Receive offers from this shop" data-testid="switch-marketing-optin" /></label> : null}
  </div>;
}

function Storefront({ shopId, onOpen }: { shopId: string; onOpen: (p: CommerceProduct) => void }) {
  const shop = useCommerceGetShop(shopId, { query: { queryKey: getCommerceGetShopQueryKey(shopId) } });
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [reportOpen, setReportOpen] = useState(false);
  if (shop.isLoading) return <Skeleton className="h-56 rounded-[2rem]" />;
  if (shop.isError || !shop.data) return <ErrorState error={shop.error} onRetry={() => shop.refetch()} />;
  const s = shop.data;
  return <div className="space-y-6">
    <header className="rise relative overflow-hidden rounded-[2rem] bg-[hsl(var(--ink))] p-6 text-[hsl(224_35%_95%)] sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: "var(--brand-gradient)" }} />
      <div className="relative flex flex-wrap items-start gap-5">
        <Thumb src={mediaSrc(s.logo)} alt={`${s.name} logo`} className="h-20 w-20 rounded-2xl ring-2 ring-white/15" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[hsl(var(--brand-cyan))]">{s.category} · {s.currency}</p>
          <h1 className="mt-1 font-display text-4xl font-semibold leading-none sm:text-5xl" data-testid="text-shop-name">{s.name}</h1>
          <p className="mt-2 flex items-center gap-3 text-xs text-white/65"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.followerCount} followers</span><span>by {s.ownerName}</span>{!s.isPublished ? <span className="rounded-full bg-white/10 px-2 py-0.5">Draft shop</span> : null}</p>
          {s.description ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80">{s.description}</p> : null}
          <div className="mt-4"><FollowControls shop={s} /></div>
        </div>
        <button onClick={() => setReportOpen(true)} className="flex items-center gap-1 text-xs text-white/50 hover:text-white" data-testid="button-report-shop"><Flag className="h-3.5 w-3.5" />Report</button>
      </div>
    </header>
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section aria-label="Shop products">
        <label className="relative mb-4 block max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${s.name}`} className="h-10 rounded-full pl-10" aria-label="Search this shop" /></label>
        <ProductGrid params={{ shopId: s.id, ...(dq ? { q: dq } : {}) }} onOpen={onOpen} empty={<EmptyState icon={Package} title="Nothing on the shelves yet" body={dq ? "No products match that search." : "This shop hasn't published products yet. Follow to hear when it does."} />} />
      </section>
      <aside className="space-y-3 text-sm">
        {[["Delivery", s.deliveryEnabled ? `Available · ${money(s.shippingMinor, s.currency)} shipping` : "Not offered"], ["Pickup", s.pickupEnabled ? (s.pickupDetails || "Available") : "Not offered"], ["Policies", s.policies || "No policies published."], ["Contact", s.contact || "Message the owner from their profile."]].map(([k, v]) =>
          <div key={k} className="rounded-2xl border bg-card p-4"><Kicker className="text-muted-foreground">{k}</Kicker><p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{v}</p></div>)}
      </aside>
    </div>
    <ReportDialog kind="shop" targetId={s.id} open={reportOpen} onOpenChange={setReportOpen} />
  </div>;
}

function ShopsDirectory({ onOpen }: { onOpen: (id: string) => void }) {
  const [scope, setScope] = useState<"discover" | "following">("discover");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [stack, setStack] = useState<string[]>([]);
  useEffect(() => setStack([]), [scope, dq]);
  const params = { scope, ...(dq ? { q: dq } : {}), ...(stack.length ? { cursor: stack[stack.length - 1] } : {}) };
  const shops = useCommerceListShops(params, { query: { queryKey: getCommerceListShopsQueryKey(params) } });
  return <section>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex rounded-full border bg-card p-1" role="group" aria-label="Shop list">{(["discover", "following"] as const).map((k) => <button key={k} aria-pressed={scope === k} onClick={() => setScope(k)} className={cn("rounded-full px-4 py-1.5 text-sm capitalize transition-colors", scope === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{k === "discover" ? "All shops" : "Following"}</button>)}</div>
      <label className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shops" className="h-10 rounded-full pl-10" aria-label="Search shops" /></label>
    </div>
    {shops.isError ? <ErrorState error={shops.error} onRetry={() => shops.refetch()} /> : null}
    {shops.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 rounded-[1.6rem]" />)}</div> : null}
    {shops.data && !shops.data.items.length ? <EmptyState icon={Store} title={scope === "following" ? "You're not following any shops" : "No shops found"} body={scope === "following" ? "Follow shops to see them here and choose whether you want their offers." : "Try a different search."} /> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shops.data?.items.map((s, i) => <button key={s.id} onClick={() => onOpen(s.id)} className="rise flex items-start gap-3 rounded-[1.6rem] border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary" style={{ animationDelay: `${i * 35}ms` }} data-testid={`card-shop-${s.id}`}>
      <Thumb src={mediaSrc(s.logo)} alt="" className="h-14 w-14 shrink-0 rounded-2xl" />
      <span className="min-w-0"><span className="block truncate font-display text-lg font-semibold">{s.name}</span><span className="block text-xs text-muted-foreground">{s.category} · {s.followerCount} followers</span><span className="mt-1 line-clamp-2 block text-xs text-foreground/70">{s.description}</span></span>
    </button>)}</div>
    {shops.data ? <Pager stack={stack} next={shops.data.nextCursor} onChange={setStack} label="Shops" /> : null}
  </section>;
}

function BuyerOrders({ onBrowse }: { onBrowse: () => void }) {
  const poll = usePollInterval(30_000);
  const [status, setStatus] = useState<CommerceListOrdersStatus | "">("");
  const [stack, setStack] = useState<string[]>([]);
  useEffect(() => setStack([]), [status]);
  const params = { scope: "buyer" as const, ...(status ? { status } : {}), ...(stack.length ? { cursor: stack[stack.length - 1] } : {}) };
  const orders = useCommerceListOrders(params, { query: { queryKey: getCommerceListOrdersQueryKey(params), refetchInterval: poll } });
  return <section className="space-y-3">
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
      {(["", ...Object.keys(ORDER_STATUS_LABEL)] as (CommerceListOrdersStatus | "")[]).map((k) => <button key={k || "all"} aria-pressed={status === k} onClick={() => setStatus(k)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors", status === k ? "border-foreground bg-foreground text-background" : "hover:border-primary")}>{k ? ORDER_STATUS_LABEL[k] : "All"}</button>)}
    </div>
    {orders.isError ? <ErrorState error={orders.error} onRetry={() => orders.refetch()} /> : null}
    {orders.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-[1.6rem]" />) : null}
    {orders.data && !orders.data.items.length ? <EmptyState icon={ShoppingBag} title="No orders here" body="Orders you place, including older classic listings, appear here with their full status history." action={<Button className="rounded-full" onClick={onBrowse}>Start shopping</Button>} /> : null}
    {orders.data?.items.map((o) => <OrderCard key={o.id} order={o} seller={false} />)}
    {orders.data ? <Pager stack={stack} next={orders.data.nextCursor} onChange={setStack} label="Orders" /> : null}
  </section>;
}

function CampaignBanner({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const c = useCommerceGetCampaign(campaignId, { query: { queryKey: getCommerceGetCampaignQueryKey(campaignId), retry: false } });
  const event = useCommerceRecordEvent();
  const eventRef = useRef(event.mutate); eventRef.current = event.mutate;
  useEffect(() => {
    const d = c.data; if (!d?.active) return;
    const k = `vm-campaign-click:${d.id}`;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* best effort */ }
    eventRef.current({ data: { kind: "campaign_click", shopId: d.shopId, campaignId: d.id, ...(d.productId ? { productId: d.productId } : {}) } });
  }, [c.data]);
  if (!c.data?.active) return null;
  return <div className="rise mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[hsl(var(--brand-magenta)/.35)] bg-[linear-gradient(110deg,hsl(var(--brand-cyan)/.08),hsl(var(--brand-magenta)/.08))] p-3 text-sm" data-testid="banner-campaign">
    <Ticket className="h-5 w-5 text-[hsl(var(--brand-magenta))]" />
    <span className="flex-1"><span className="font-semibold">{c.data.name}</span>{c.data.creatorName ? <span className="text-muted-foreground"> · shared by {c.data.creatorName}</span> : null}</span>
    {c.data.couponCode ? <button onClick={() => { void navigator.clipboard.writeText(c.data!.couponCode!).then(() => toast({ title: "Code copied", description: "Paste it at checkout." })); }} className="flex items-center gap-1.5 rounded-full border border-dashed border-[hsl(var(--brand-magenta))] px-3 py-1 font-mono text-xs font-semibold" data-testid="button-copy-campaign-code"><Copy className="h-3 w-3" />{c.data.couponCode}</button> : null}
  </div>;
}

function ShopInner() {
  const me = useMe();
  const router = useRouter();
  const sp = useSearchParams();
  const productId = sp.get("product") ?? "";
  const shopId = sp.get("shop") ?? "";
  const campaignId = sp.get("campaign") ?? "";
  const view = (sp.get("view") as View) || "discover";
  const { count, patch, cart } = useCart(me.id);
  const [search, setSearch] = useState("");
  const dq = useDebounced(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [currency, setCurrency] = useState("");
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [sort, setSort] = useState<CommerceListProductsSort>("newest");
  const event = useCommerceRecordEvent();
  const eventRef = useRef(event.mutate); eventRef.current = event.mutate;
  const campaign = useCommerceGetCampaign(campaignId, { query: { queryKey: getCommerceGetCampaignQueryKey(campaignId), enabled: !!campaignId, retry: false } });
  const campaignCode = campaign.data?.active ? campaign.data.couponCode : undefined;
  useEffect(() => { if (campaignCode && cart && !cart.couponCode) patch({ couponCode: campaignCode }); }, [campaignCode, cart, patch]);

  const go = (q: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => { if (v) u.set(k, v); });
    if (campaignId && !("campaign" in q)) u.set("campaign", campaignId);
    router.push(`/shop${u.toString() ? `?${u}` : ""}`);
  };
  const openProduct = (p: CommerceProduct) => { if (p.shopId) eventRef.current({ data: { kind: "product_click", shopId: p.shopId, productId: p.id, ...(campaignId ? { campaignId } : {}) } }); go({ product: p.id, shop: p.shopId }); };
  const cur = currency.trim().toUpperCase();
  const curOk = validCurrency(cur);
  const discoverParams: CommerceListProductsParams = {
    scope: "discover", sort, ...(dq ? { q: dq } : {}), ...(category.trim() ? { category: category.trim() } : {}),
    ...(curOk ? { currency: cur } : {}),
    ...(curOk && minP && Number.isFinite(toMinor(minP, cur)) ? { minPrice: toMinor(minP, cur) } : {}),
    ...(curOk && maxP && Number.isFinite(toMinor(maxP, cur)) ? { maxPrice: toMinor(maxP, cur) } : {}),
  };

  return <PageScroll className="max-w-6xl">
    <header className="rise relative overflow-hidden rounded-[2rem] bg-[hsl(var(--ink))] px-5 py-6 text-[hsl(224_35%_95%)] sm:px-8 sm:py-8">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--brand-gradient)" }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 h-64 w-[36rem] rounded-full opacity-25 blur-3xl" style={{ background: "var(--brand-gradient)" }} />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-mono text-[10px] uppercase tracking-[.26em] text-[hsl(var(--brand-cyan))]">VastMind Market</p><h1 className="mt-2 font-display text-4xl font-semibold leading-[.95] sm:text-6xl">Shop the <span className="brand-gradient-text">people</span> you follow.</h1><p className="mt-3 max-w-lg text-sm text-white/65">Shops and creators from your network. Order here, pay the seller directly.</p></div>
        <Button onClick={() => go({ view: "cart" })} className="relative h-11 rounded-full bg-white text-[hsl(var(--ink))] hover:bg-white/90" data-testid="button-open-cart"><ShoppingBag className="mr-2 h-4 w-4" />Cart{count ? <span key={count} className="rise ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">{count}</span> : null}</Button>
      </div>
      <nav className="relative mt-6 flex gap-1 overflow-x-auto" aria-label="Market sections">
        {VIEWS.map(([k, label]) => { const on = !productId && !shopId && view === k; return <button key={k} onClick={() => go({ view: k === "discover" ? undefined : k })} aria-current={on ? "page" : undefined} className={cn("relative shrink-0 rounded-full px-4 py-2 text-sm transition-colors", on ? "bg-white/12 text-white" : "text-white/60 hover:text-white")} data-testid={`tab-${k}`}>{label}{on ? <span className="absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full" style={{ background: "var(--brand-gradient)" }} /> : null}</button>; })}
      </nav>
    </header>

    <div className="mt-6">
      {campaignId ? <CampaignBanner campaignId={campaignId} /> : null}
      {productId || shopId ? <Button variant="ghost" size="sm" className="mb-4 -ml-2 rounded-full" onClick={() => productId && shopId ? go({ shop: shopId }) : router.back()} data-testid="button-back"><ArrowLeft className="mr-1 h-4 w-4" />{productId && shopId ? "Back to shop" : "Back"}</Button> : null}

      {productId ? <ProductDetail productId={productId} campaignId={campaignId || undefined} onOpenShop={(id) => go({ shop: id })} onOpenCart={() => go({ view: "cart" })} />
        : shopId ? <Storefront shopId={shopId} onOpen={openProduct} />
        : view === "cart" ? <Checkout onBrowse={() => go({})} onOpenProduct={(id) => go({ product: id })} onPlaced={() => go({ view: "orders", campaign: undefined })} />
        : view === "orders" ? <BuyerOrders onBrowse={() => go({})} />
        : view === "shops" ? <ShopsDirectory onOpen={(id) => go({ shop: id })} />
        : view === "saved" ? <ProductGrid params={{ scope: "saved" }} onOpen={openProduct} empty={<EmptyState icon={Bookmark} title="Nothing saved yet" body="Tap the bookmark on any product to keep it here." action={<Button className="rounded-full" onClick={() => go({})}>Discover products</Button>} />} />
        : <section>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative min-w-56 flex-1"><Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products, shops, categories" className="h-11 rounded-full pl-10" aria-label="Search products" data-testid="input-search-products" /></label>
            <select value={sort} onChange={(e) => setSort(e.target.value as CommerceListProductsSort)} className={cn(selectClass, "h-11 w-auto rounded-full")} aria-label="Sort" data-testid="select-sort"><option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option></select>
            <Button variant="outline" className="h-11 rounded-full" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)} data-testid="button-filters"><SlidersHorizontal className="mr-2 h-4 w-4" />Filters</Button>
          </div>
          {filtersOpen ? <div className="rise mb-5 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4">
            <label className="text-xs font-medium">Category<Input className="mt-1" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} placeholder="Any" /></label>
            <label className="text-xs font-medium">Currency<Input className="mt-1 font-mono uppercase" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} placeholder="e.g. NGN" aria-invalid={!!cur && !curOk} /></label>
            <label className="text-xs font-medium">Min price<Input className="mt-1" type="number" min="0" step="any" value={minP} disabled={!curOk} onChange={(e) => setMinP(e.target.value)} /></label>
            <label className="text-xs font-medium">Max price<Input className="mt-1" type="number" min="0" step="any" value={maxP} disabled={!curOk} onChange={(e) => setMaxP(e.target.value)} /></label>
            <p className="text-[11px] text-muted-foreground sm:col-span-4">Price filters apply within a single currency so amounts compare correctly.</p>
          </div> : null}
          <ProductGrid params={discoverParams} onOpen={openProduct} empty={<EmptyState icon={Store} title="No products match" body={dq || category || curOk ? "Loosen the filters or try another search." : "Shops haven't published products yet. Open Seller Center to start yours."} action={<Button className="rounded-full" onClick={() => router.push("/business")}>Open Seller Center</Button>} />} />
        </section>}
    </div>
  </PageScroll>;
}

export default function ShopPage() {
  return <Suspense fallback={<PageScroll className="max-w-6xl"><Skeleton className="h-48 rounded-[2rem]" /></PageScroll>}><ShopInner /></Suspense>;
}
