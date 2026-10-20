"use client";
import { useState } from "react";
import { Copy, Link2, Loader2, Megaphone, Pencil, Plus, Ticket, Users, X } from "lucide-react";
import {
  useCommerceListCoupons, getCommerceListCouponsQueryKey, useCommerceCreateCoupon, useCommerceUpdateCoupon,
  useCommerceListCampaigns, getCommerceListCampaignsQueryKey, useCommerceCreateCampaign, useCommerceUpdateCampaign,
  useCommerceListCustomers, getCommerceListCustomersQueryKey, useCommerceUpdateCustomer,
  useCommerceListProducts, getCommerceListProductsQueryKey, useCommerceListTeam, getCommerceListTeamQueryKey,
  type CommerceCouponInputKind, type CommerceCustomer, type CommerceShop,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { useMe } from "@/lib/me";
import { useToast } from "@/hooks/use-toast";
import { useInvalidate } from "@/lib/realtime";
import { errMessage } from "@/lib/format";
import { basePath } from "@/lib/base";
import { money, toMinor } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { Kicker, Pager, selectClass } from "../bits";

function useShopProducts(shopId: string, enabled = true) {
  const p = { shopId };
  return useCommerceListProducts(p, { query: { queryKey: getCommerceListProductsQueryKey(p), enabled } });
}

// ---------- Coupons ----------
export function Coupons({ shop }: { shop: CommerceShop }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const list = useCommerceListCoupons(shop.id, { query: { queryKey: getCommerceListCouponsQueryKey(shop.id) } });
  const [open, setOpen] = useState(false);
  const products = useShopProducts(shop.id, open);
  const blank = { code: "", kind: "percent" as CommerceCouponInputKind, value: "10", minSpend: "0", maxRedemptions: "100", perBuyerLimit: "1", expires: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), productIds: [] as string[] };
  const [f, setF] = useState(blank);
  const [touched, setTouched] = useState(false);
  const create = useCommerceCreateCoupon({ mutation: {
    onSuccess: (c) => { invalidate("/api/commerce"); setOpen(false); setF(blank); setTouched(false); toast({ title: `Coupon ${c.code} created` }); },
    onError: (e) => toast({ title: "Couldn't create coupon", description: errMessage(e), variant: "destructive" }),
  } });
  const toggle = useCommerceUpdateCoupon({ mutation: {
    onSuccess: (c) => { invalidate("/api/commerce"); toast({ title: c.active ? `${c.code} is active` : `${c.code} paused` }); },
    onError: (e) => toast({ title: "Couldn't update coupon", description: errMessage(e), variant: "destructive" }),
  } });
  const value = f.kind === "percent" ? Number(f.value) : toMinor(f.value, shop.currency);
  const minSpend = toMinor(f.minSpend || "0", shop.currency);
  const errors = {
    code: !/^[A-Za-z0-9_-]{3,40}$/.test(f.code) ? "3-40 letters, numbers, dashes or underscores" : "",
    value: f.kind === "percent" ? (!Number.isInteger(value) || value < 1 || value > 100 ? "1 to 100 percent" : "") : (!(value >= 1) ? "Enter an amount" : ""),
    minSpend: !Number.isFinite(minSpend) ? "Enter an amount" : "",
    limits: !(Number(f.maxRedemptions) >= 1) || !(Number(f.perBuyerLimit) >= 1) ? "Limits must be at least 1" : "",
    expires: new Date(`${f.expires}T23:59:59`) <= new Date() ? "Pick a future date" : "",
  };
  const err = (k: keyof typeof errors) => touched && errors[k] ? <p className="mt-1 text-[11px] text-destructive" role="alert">{errors[k]}</p> : null;
  function submit() {
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    create.mutate({ shopId: shop.id, data: { code: f.code.toUpperCase(), kind: f.kind, value, minSpendMinor: minSpend, maxRedemptions: Math.floor(Number(f.maxRedemptions)), perBuyerLimit: Math.floor(Number(f.perBuyerLimit)), expiresAt: new Date(`${f.expires}T23:59:59`).toISOString(), ...(f.productIds.length ? { productIds: f.productIds } : {}) } });
  }

  return <section>
    <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Codes buyers enter at checkout. Discounts are applied by the server quote.</p><Button className="rounded-full" onClick={() => setOpen(true)} data-testid="button-new-coupon"><Plus className="mr-1 h-4 w-4" />New coupon</Button></div>
    {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
    {list.isLoading ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-32 rounded-[1.4rem]" />)}</div> : null}
    {list.data && !list.data.length ? <EmptyState icon={Ticket} title="No coupons yet" body="Create a code for followers, a launch, or a creator campaign." /> : null}
    <div className="grid gap-3 sm:grid-cols-2">{list.data?.map((c) => { const expired = new Date(c.expiresAt) < new Date(); return <article key={c.id} className={cn("rise relative overflow-hidden rounded-[1.4rem] border bg-card p-4", !c.active && "opacity-70")} data-testid={`card-coupon-${c.id}`}>
      <div aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.active && !expired ? "var(--brand-gradient)" : "hsl(var(--muted))" }} />
      <div className="flex items-start justify-between gap-2 pl-2"><div><p className="font-mono text-lg font-bold tracking-wider">{c.code}</p><p className="text-sm">{c.kind === "percent" ? `${c.value}% off` : `${money(c.value, c.currency)} off`}{c.minSpendMinor ? ` over ${money(c.minSpendMinor, c.currency)}` : ""}</p></div>
        <Switch checked={c.active} disabled={toggle.isPending} onCheckedChange={(v) => toggle.mutate({ couponId: c.id, data: { active: v } })} aria-label={`${c.code} active`} /></div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-2 text-xs text-muted-foreground"><span>{c.redemptions}/{c.maxRedemptions} used</span><span>{c.perBuyerLimit} per buyer</span><span className={expired ? "text-destructive" : ""}>{expired ? "Expired" : "Expires"} {new Date(c.expiresAt).toLocaleDateString()}</span><span>{c.productIds?.length ? `${c.productIds.length} products` : "All products"}</span></div>
      <div className="mt-2 ml-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${Math.min(1, c.redemptions / c.maxRedemptions)})` }} /></div>
    </article>; })}</div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>New coupon</DialogTitle><DialogDescription>Amounts in {shop.currency}.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div><Label htmlFor="c-code">Code</Label><Input id="c-code" className="font-mono uppercase" maxLength={40} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} data-testid="input-coupon-code" />{err("code")}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="c-kind">Type</Label><select id="c-kind" className={cn(selectClass, "mt-1")} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CommerceCouponInputKind })}><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></select></div>
            <div><Label htmlFor="c-val">{f.kind === "percent" ? "Percent" : `Amount (${shop.currency})`}</Label><Input id="c-val" type="number" min="0" step={f.kind === "percent" ? "1" : "any"} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />{err("value")}</div>
            <div><Label htmlFor="c-min">Minimum spend</Label><Input id="c-min" type="number" min="0" step="any" value={f.minSpend} onChange={(e) => setF({ ...f, minSpend: e.target.value })} />{err("minSpend")}</div>
            <div><Label htmlFor="c-exp">Expires</Label><Input id="c-exp" type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />{err("expires")}</div>
            <div><Label htmlFor="c-max">Total uses</Label><Input id="c-max" type="number" min="1" step="1" value={f.maxRedemptions} onChange={(e) => setF({ ...f, maxRedemptions: e.target.value })} /></div>
            <div><Label htmlFor="c-per">Uses per buyer</Label><Input id="c-per" type="number" min="1" step="1" value={f.perBuyerLimit} onChange={(e) => setF({ ...f, perBuyerLimit: e.target.value })} /></div>
          </div>
          {err("limits")}
          <fieldset><legend className="text-sm font-medium">Eligible products</legend><p className="text-[11px] text-muted-foreground">Leave all unchecked to apply to the whole shop.</p>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border p-2">{products.isLoading ? <Skeleton className="h-8" /> : products.data?.items.map((p) => <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted"><input type="checkbox" checked={f.productIds.includes(p.id)} onChange={(e) => setF({ ...f, productIds: e.target.checked ? [...f.productIds, p.id] : f.productIds.filter((x) => x !== p.id) })} /><span className="truncate">{p.title}</span></label>)}{products.data && !products.data.items.length ? <p className="p-2 text-xs text-muted-foreground">No products yet.</p> : null}</div>
          </fieldset>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} data-testid="button-create-coupon">{create.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Create coupon</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}

// ---------- Campaigns ----------
export function Campaigns({ shop }: { shop: CommerceShop }) {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const isCreator = shop.role === "creator";
  const list = useCommerceListCampaigns(shop.id, { query: { queryKey: getCommerceListCampaignsQueryKey(shop.id) } });
  const [open, setOpen] = useState(false);
  const products = useShopProducts(shop.id, open);
  const coupons = useCommerceListCoupons(shop.id, { query: { queryKey: getCommerceListCouponsQueryKey(shop.id), enabled: open && !isCreator } });
  const team = useCommerceListTeam(shop.id, { query: { queryKey: getCommerceListTeamQueryKey(shop.id), enabled: open && !isCreator } });
  const [f, setF] = useState({ name: "", productId: "", creatorId: "", couponId: "" });
  const create = useCommerceCreateCampaign({ mutation: {
    onSuccess: (c) => { invalidate("/api/commerce"); setOpen(false); setF({ name: "", productId: "", creatorId: "", couponId: "" }); toast({ title: `Campaign "${c.name}" is live`, description: "Copy the link to share it." }); },
    onError: (e) => toast({ title: "Couldn't create campaign", description: errMessage(e), variant: "destructive" }),
  } });
  const toggle = useCommerceUpdateCampaign({ mutation: {
    onSuccess: (c) => { invalidate("/api/commerce"); toast({ title: c.active ? "Campaign resumed" : "Campaign paused" }); },
    onError: (e) => toast({ title: "Couldn't update campaign", description: errMessage(e), variant: "destructive" }),
  } });
  const copy = (path: string) => { void navigator.clipboard.writeText(`${window.location.origin}${basePath}${path}`).then(() => toast({ title: "Campaign link copied" })); };
  const creators = team.data?.filter((t) => t.role === "creator") ?? [];

  return <section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm text-muted-foreground">{isCreator ? "Your approved links for this shop. Clicks, carts and orders are counted from real VastMind activity. Creator campaigns carry no payouts." : "Trackable first-party links for posts, bios and creators. Attach a coupon to give buyers a reason to click."}</p><Button className="rounded-full" onClick={() => { setF((x) => ({ ...x, creatorId: isCreator ? me.id : x.creatorId })); setOpen(true); }} data-testid="button-new-campaign"><Plus className="mr-1 h-4 w-4" />New campaign</Button></div>
    {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
    {list.isLoading ? <Skeleton className="h-40 rounded-[1.4rem]" /> : null}
    {list.data && !list.data.length ? <EmptyState icon={Megaphone} title="No campaigns yet" body="Create a link for a product drop, a creator collaboration, or a follower offer." /> : null}
    <div className="space-y-3">{list.data?.map((c) => <article key={c.id} className="rise rounded-[1.4rem] border bg-card p-4" data-testid={`card-campaign-${c.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-display text-lg font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.creatorName ? `Creator: ${c.creatorName}` : "Shop campaign"}{c.couponCode ? ` · code ${c.couponCode}` : ""}{c.productId ? " · single product" : " · whole shop"}</p></div>
        <div className="flex items-center gap-2"><Button size="sm" variant="outline" className="rounded-full" onClick={() => copy(c.linkPath)} data-testid={`button-copy-campaign-${c.id}`}><Copy className="mr-1 h-3.5 w-3.5" />Copy link</Button>{!isCreator ? <Switch checked={c.active} disabled={toggle.isPending} onCheckedChange={(v) => toggle.mutate({ campaignId: c.id, data: { active: v } })} aria-label={`${c.name} active`} /> : <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", c.active ? "bg-online/12 text-online" : "bg-muted")}>{c.active ? "Active" : "Paused"}</span>}</div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground"><Link2 className="h-3 w-3 shrink-0" />{c.linkPath}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">{([["Clicks", c.clicks ?? 0], ["Carts", c.carts ?? 0], ["Orders", c.orders ?? 0]] as const).map(([k, v]) => <div key={k} className="rounded-xl bg-muted/60 p-2"><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt><dd className="font-display text-xl font-semibold tabular-nums">{v}</dd></div>)}</dl>
    </article>)}</div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New campaign</DialogTitle><DialogDescription>Generates a link to /shop with campaign tracking.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) create.mutate({ shopId: shop.id, data: { name: f.name.trim(), ...(f.productId ? { productId: f.productId } : {}), ...(f.creatorId ? { creatorId: f.creatorId } : {}), ...(f.couponId ? { couponId: f.couponId } : {}) } }); }}>
          <div><Label htmlFor="cp-name">Name</Label><Input id="cp-name" maxLength={150} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Spring drop with Ada" data-testid="input-campaign-name" /></div>
          <div><Label htmlFor="cp-prod">Product</Label><select id="cp-prod" className={cn(selectClass, "mt-1")} value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}><option value="">Whole shop</option>{products.data?.items.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
          {!isCreator ? <>
            <div><Label htmlFor="cp-creator">Creator</Label><select id="cp-creator" className={cn(selectClass, "mt-1")} value={f.creatorId} onChange={(e) => setF({ ...f, creatorId: e.target.value })}><option value="">None</option>{creators.map((t) => <option key={t.userId} value={t.userId}>{t.name} (@{t.username})</option>)}</select>{!creators.length && team.data ? <p className="mt-1 text-[11px] text-muted-foreground">Approve creators in Team to attribute campaigns to them.</p> : null}</div>
            <div><Label htmlFor="cp-coupon">Coupon</Label><select id="cp-coupon" className={cn(selectClass, "mt-1")} value={f.couponId} onChange={(e) => setF({ ...f, couponId: e.target.value })}><option value="">No coupon</option>{coupons.data?.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></div>
          </> : <p className="text-xs text-muted-foreground">This link will be attributed to you.</p>}
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!f.name.trim() || create.isPending} data-testid="button-create-campaign">{create.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Create</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}

// ---------- Customers (private CRM) ----------
function CustomerEditor({ shopId, c, onClose }: { shopId: string; c: CommerceCustomer; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [notes, setNotes] = useState(c.notes);
  const [labels, setLabels] = useState<string[]>(c.labels);
  const [draft, setDraft] = useState("");
  const save = useCommerceUpdateCustomer({ mutation: {
    onSuccess: () => { invalidate("/api/commerce"); toast({ title: "Customer notes saved" }); onClose(); },
    onError: (e) => toast({ title: "Couldn't save", description: errMessage(e), variant: "destructive" }),
  } });
  const addLabel = () => { const l = draft.trim().slice(0, 50); if (l && !labels.includes(l) && labels.length < 10) setLabels([...labels, l]); setDraft(""); };
  return <>
    <div><Label htmlFor="cu-label">Labels ({labels.length}/10)</Label>
      <div className="mt-1 flex flex-wrap gap-1.5">{labels.map((l) => <span key={l} className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{l}<button type="button" aria-label={`Remove label ${l}`} onClick={() => setLabels(labels.filter((x) => x !== l))}><X className="h-3 w-3" /></button></span>)}</div>
      <div className="mt-2 flex gap-2"><Input id="cu-label" maxLength={50} value={draft} disabled={labels.length >= 10} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }} placeholder="VIP, wholesale, repeat" /><Button type="button" variant="outline" onClick={addLabel} disabled={!draft.trim()}>Add</Button></div>
    </div>
    <div><Label htmlFor="cu-notes">Private notes</Label><Textarea id="cu-notes" rows={5} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} /><p className="mt-1 text-[11px] text-muted-foreground">Only your shop team can see notes and labels.</p></div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={save.isPending} onClick={() => save.mutate({ shopId, userId: c.userId, data: { notes: notes.trim(), labels } })} data-testid="button-save-customer">{save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Save</Button></DialogFooter>
  </>;
}

export function Customers({ shop }: { shop: CommerceShop }) {
  const [stack, setStack] = useState<string[]>([]);
  const [editing, setEditing] = useState<CommerceCustomer | null>(null);
  const params = stack.length ? { cursor: stack[stack.length - 1] } : undefined;
  const list = useCommerceListCustomers(shop.id, params, { query: { queryKey: getCommerceListCustomersQueryKey(shop.id, params) } });
  return <section>
    <p className="mb-4 max-w-2xl text-sm text-muted-foreground">Buyers who ordered from this shop. Offer preference is set by each buyer when they follow you; VastMind has no bulk messaging, so reach out only in reply to real conversations.</p>
    {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
    {list.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div> : null}
    {list.data && !list.data.items.length ? <EmptyState icon={Users} title="No customers yet" body="Customers appear after their first order." /> : null}
    {list.data?.items.length ? <ul className="divide-y overflow-hidden rounded-[1.4rem] border bg-card">{list.data.items.map((c) => <li key={c.userId} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid={`row-customer-${c.userId}`}>
      <div className="min-w-0 flex-1"><p className="font-medium">{c.name} <span className="text-xs font-normal text-muted-foreground">@{c.username}</span></p><p className="text-xs text-muted-foreground">{c.orderCount} order{c.orderCount === 1 ? "" : "s"}{c.notes ? ` · ${c.notes.slice(0, 60)}${c.notes.length > 60 ? "..." : ""}` : ""}</p>
        {c.labels.length ? <div className="mt-1 flex flex-wrap gap-1">{c.labels.map((l) => <span key={l} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">{l}</span>)}</div> : null}</div>
      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", c.marketingOptIn ? "bg-online/12 text-online" : "bg-muted text-muted-foreground")}>{c.marketingOptIn ? "Accepts offers" : "No offers"}</span>
      <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit notes for ${c.name}`}><Pencil className="h-4 w-4" /></Button>
    </li>)}</ul> : null}
    {list.data ? <Pager stack={stack} next={list.data.nextCursor} onChange={setStack} label="Customers" /> : null}
    <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent><DialogHeader><DialogTitle>{editing?.name}</DialogTitle><DialogDescription><Kicker className="inline">Private CRM</Kicker></DialogDescription></DialogHeader>{editing ? <CustomerEditor key={editing.userId} shopId={shop.id} c={editing} onClose={() => setEditing(null)} /> : null}</DialogContent>
    </Dialog>
  </section>;
}
