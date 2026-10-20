"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Inbox } from "lucide-react";
import {
  useCommerceGetDashboard, getCommerceGetDashboardQueryKey, useCommerceListOrders, getCommerceListOrdersQueryKey,
  type CommerceListOrdersStatus, type CommerceShop,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { OrderCard } from "../order-card";
import { Kicker, Metric, Pager } from "../bits";
import { usePollInterval } from "@/lib/realtime";
import { downloadCsv, money, ORDER_STATUS_LABEL, shortId } from "@/lib/commerce";
import { cn } from "@/lib/utils";

const day = (d: Date) => d.toISOString().slice(0, 10); // UTC dates; server treats both ends inclusively
const pct = (a: number, b: number) => b ? `${(Math.round((a / b) * 1000) / 10).toFixed(1)}%` : "--";

export function Dashboard({ shop }: { shop: CommerceShop }) {
  const [from, setFrom] = useState(() => day(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(() => day(new Date()));
  const params = useMemo(() => ({ from, to }), [from, to]);
  const valid = from <= to;
  const d = useCommerceGetDashboard(shop.id, params, { query: { queryKey: getCommerceGetDashboardQueryKey(shop.id, params), enabled: valid } });
  const data = d.data;

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [["VastMind shop report", shop.name], ["From", from], ["To", to], [], ["Metric", "Value"],
      ["Product views", data.views], ["Product clicks", data.clicks], ["Add to cart", data.carts], ["Orders", data.conversions], ["Pending orders", data.pendingOrders], ["Followers", data.followerCount], [],
      ["Currency", "Gross order value", "Completed value", "Manual payment recorded", "Order count"],
      ...data.currencies.map((c) => [c.currency, money(c.grossOrderValueMinor, c.currency), money(c.completedValueMinor, c.currency), money(c.manualConfirmedValueMinor, c.currency), c.orderCount]), [],
      ["Top product", "Units", "Order value"], ...data.topProducts.map((p) => [p.title, p.units, money(p.orderValueMinor, p.currency)]), [],
      ["Campaign", "Clicks", "Carts", "Orders"], ...data.campaigns.map((c) => [c.name, c.clicks ?? "", c.carts ?? "", c.orders ?? ""])];
    downloadCsv(`${shop.slug}-report-${from}-to-${to}.csv`, rows);
  }

  const funnel = data ? [["Views", data.views], ["Clicks", data.clicks], ["Add to cart", data.carts], ["Orders", data.conversions]] as const : [];
  const top = data ? Math.max(1, data.views, data.clicks, data.carts, data.conversions) : 1;

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium">From<Input type="date" className="mt-1 h-9" value={from} max={to} onChange={(e) => setFrom(e.target.value)} data-testid="input-date-from" /></label>
      <label className="text-xs font-medium">To<Input type="date" className="mt-1 h-9" value={to} min={from} onChange={(e) => setTo(e.target.value)} data-testid="input-date-to" /></label>
      {!valid ? <p className="text-xs text-destructive" role="alert">Start date must be before end date.</p> : null}
      <Button variant="outline" size="sm" className="ml-auto rounded-full" disabled={!data} onClick={exportCsv} data-testid="button-export-dashboard"><Download className="mr-1 h-4 w-4" />Export CSV</Button>
    </div>
    {d.isError ? <ErrorState error={d.error} onRetry={() => d.refetch()} /> : null}
    {d.isLoading ? <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[1.4rem]" />)}</div> : null}
    {data ? <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Pending orders" value={data.pendingOrders} hint="Need confirmation" tone="bg-[hsl(var(--ink))] text-[hsl(224_35%_95%)] border-transparent" />
        <Metric label="Products" value={data.productCount} hint={data.lowStockCount ? `${data.lowStockCount} low on stock` : "Stock healthy"} />
        <Metric label="Followers" value={data.followerCount} />
        <Metric label="Orders in range" value={data.conversions} hint={`${pct(data.conversions, data.views)} of views`} />
      </div>
      {data.lowStockCount ? <p className="flex items-center gap-2 rounded-xl bg-[hsl(var(--brand-magenta)/.08)] p-3 text-sm"><AlertTriangle className="h-4 w-4 text-[hsl(var(--brand-magenta))]" />{data.lowStockCount} product{data.lowStockCount > 1 ? "s are" : " is"} at 5 units or fewer.</p> : null}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-[1.4rem] border bg-card p-5">
          <Kicker>First-party funnel (UTC days)</Kicker>
          <p className="mt-1 text-xs text-muted-foreground">Unique daily events from VastMind buyers. No modelled or estimated data.</p>
          <ol className="mt-4 space-y-3">{funnel.map(([label, v], i) => <li key={label}>
            <div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums font-semibold">{v}{i ? <span className="ml-2 text-xs font-normal text-muted-foreground">{pct(v, funnel[i - 1][1])}</span> : null}</span></div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left rounded-full transition-transform duration-700" style={{ transform: `scaleX(${v / top})`, background: "var(--brand-gradient)" }} /></div>
          </li>)}</ol>
        </div>
        <div className="rounded-[1.4rem] border bg-card p-5">
          <Kicker>Order value by currency</Kicker>
          {!data.currencies.length ? <p className="mt-3 text-sm text-muted-foreground">No orders in this range.</p> : <div className="mt-3 space-y-3">{data.currencies.map((c) => <div key={c.currency} className="rounded-xl bg-muted/50 p-3 text-sm">
            <div className="flex items-baseline justify-between"><span className="font-mono text-xs">{c.currency} · {c.orderCount} orders</span><span className="font-display text-xl font-semibold tabular-nums">{money(c.grossOrderValueMinor, c.currency)}</span></div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Completed {money(c.completedValueMinor, c.currency)}</span><span>Manual paid {money(c.manualConfirmedValueMinor, c.currency)}</span></div>
          </div>)}<p className="text-[11px] text-muted-foreground">Gross order value is what buyers ordered, not money collected. Payments are recorded manually by your team.</p></div>}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.4rem] border bg-card p-5"><Kicker>Top products</Kicker>{!data.topProducts.length ? <p className="mt-3 text-sm text-muted-foreground">No sales in range yet.</p> : <ol className="mt-3 divide-y">{data.topProducts.map((p, i) => <li key={`${p.productId}-${p.currency}`} className="flex items-center gap-3 py-2 text-sm"><span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate">{p.title}</span><span className="tabular-nums text-muted-foreground">{p.units} units</span><span className="tabular-nums font-medium">{money(p.orderValueMinor, p.currency)}</span></li>)}</ol>}</div>
        <div className="rounded-[1.4rem] border bg-card p-5"><Kicker>Campaign performance</Kicker>{!data.campaigns.length ? <p className="mt-3 text-sm text-muted-foreground">No campaigns yet.</p> : <table className="mt-3 w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-1 font-medium">Campaign</th><th className="font-medium">Clicks</th><th className="font-medium">Carts</th><th className="font-medium">Orders</th></tr></thead><tbody className="divide-y">{data.campaigns.map((c) => <tr key={c.id}><td className="truncate py-2">{c.name}</td><td className="tabular-nums">{c.clicks ?? 0}</td><td className="tabular-nums">{c.carts ?? 0}</td><td className="tabular-nums">{c.orders ?? 0}</td></tr>)}</tbody></table>}</div>
      </div>
    </> : null}
  </section>;
}

export function SellerOrders({ shop }: { shop: CommerceShop }) {
  const poll = usePollInterval(20_000);
  const [all, setAll] = useState(false);
  const [status, setStatus] = useState<CommerceListOrdersStatus | "">("pending");
  const [stack, setStack] = useState<string[]>([]);
  useEffect(() => setStack([]), [all, status, shop.id]);
  const params = { scope: "seller" as const, ...(all ? {} : { shopId: shop.id }), ...(status ? { status } : {}), ...(stack.length ? { cursor: stack[stack.length - 1] } : {}) };
  const orders = useCommerceListOrders(params, { query: { queryKey: getCommerceListOrdersQueryKey(params), refetchInterval: poll } });

  function exportCsv() {
    const items = orders.data?.items ?? [];
    downloadCsv(`${shop.slug}-orders${status ? `-${status}` : ""}-page${stack.length + 1}.csv`, [["Order", "Created", "Buyer", "Status", "Payment", "Fulfillment", "Currency", "Subtotal", "Discount", "Shipping", "Total", "Items", "Tracking"],
      ...items.map((o) => [shortId(o.id), o.createdAt, o.buyerName, o.status, o.paymentStatus, o.fulfillment, o.currency, money(o.subtotalMinor, o.currency), money(o.discountMinor, o.currency), money(o.shippingMinor, o.currency), money(o.totalMinor, o.currency), o.items.map((i) => `${i.quantity}x ${i.title}${i.variantLabel ? ` (${i.variantLabel})` : ""}`).join("; "), o.trackingNumber])]);
  }

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        {(["", ...Object.keys(ORDER_STATUS_LABEL)] as (CommerceListOrdersStatus | "")[]).map((k) => <button key={k || "all"} aria-pressed={status === k} onClick={() => setStatus(k)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors", status === k ? "border-foreground bg-foreground text-background" : "hover:border-primary")} data-testid={`filter-status-${k || "all"}`}>{k ? ORDER_STATUS_LABEL[k] : "All"}</button>)}
      </div>
      <label className="ml-auto flex items-center gap-2 text-xs"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Include classic listing sales</label>
      <Button variant="outline" size="sm" className="rounded-full" disabled={!orders.data?.items.length} onClick={exportCsv} data-testid="button-export-orders"><Download className="mr-1 h-4 w-4" />CSV</Button>
    </div>
    {orders.isError ? <ErrorState error={orders.error} onRetry={() => orders.refetch()} /> : null}
    {orders.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-[1.6rem]" />) : null}
    {orders.data && !orders.data.items.length ? <EmptyState icon={Inbox} title={status ? `No ${ORDER_STATUS_LABEL[status].toLowerCase()} orders` : "No orders yet"} body="New orders appear here automatically. Confirm them, record manual payment, and keep buyers posted." /> : null}
    {orders.data?.items.map((o) => <OrderCard key={o.id} order={o} seller />)}
    {orders.data ? <Pager stack={stack} next={orders.data.nextCursor} onChange={setStack} label="Orders" /> : null}
  </section>;
}
