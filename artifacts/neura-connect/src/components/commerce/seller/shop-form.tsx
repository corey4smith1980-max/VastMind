"use client";
import { useState } from "react";
import { Loader2, Store, X } from "lucide-react";
import { useCommerceCreateShop, useCommerceUpdateShop, type CommerceShop, type CommerceShopInput, type MediaAttachment } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MediaPicker } from "@/components/media-attachment";
import { useToast } from "@/hooks/use-toast";
import { useInvalidate } from "@/lib/realtime";
import { errMessage } from "@/lib/format";
import { fromMinor, mediaSrc, toMinor, validCurrency } from "@/lib/commerce";
import { Kicker, Thumb } from "../bits";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function ShopForm({ shop, currencyLocked, onSaved }: { shop?: CommerceShop; currencyLocked?: boolean; onSaved: (s: CommerceShop) => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [f, setF] = useState({
    name: shop?.name ?? "", slug: shop?.slug ?? "", slugTouched: !!shop, currency: shop?.currency ?? "USD", category: shop?.category ?? "",
    description: shop?.description ?? "", policies: shop?.policies ?? "", contact: shop?.contact ?? "", pickupDetails: shop?.pickupDetails ?? "",
    shipping: shop ? fromMinor(shop.shippingMinor, shop.currency) : "0", deliveryEnabled: shop?.deliveryEnabled ?? true, pickupEnabled: shop?.pickupEnabled ?? false, isPublished: shop?.isPublished ?? true,
  });
  const [logo, setLogo] = useState<MediaAttachment | undefined>();
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [touched, setTouched] = useState(false);
  const opts = { mutation: {
    onSuccess: (s: CommerceShop) => { invalidate("/api/commerce"); toast({ title: shop ? "Shop settings saved" : `${s.name} is open`, description: shop ? undefined : "Add your first product next." }); onSaved(s); },
    onError: (e: unknown) => toast({ title: "Couldn't save shop", description: errMessage(e), variant: "destructive" }),
  } };
  const create = useCommerceCreateShop(opts);
  const update = useCommerceUpdateShop(opts);
  const busy = create.isPending || update.isPending;
  const cur = f.currency.trim().toUpperCase();
  const shippingMinor = toMinor(f.shipping || "0", cur);
  const errors = {
    name: f.name.trim().length < 2 ? "At least 2 characters" : "",
    slug: !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug) || f.slug.length < 3 ? "3-60 lowercase letters, numbers and dashes" : "",
    currency: !validCurrency(cur) ? "Use a valid three-letter code like USD, NGN or JPY" : "",
    category: !f.category.trim() ? "Required" : "",
    shipping: !Number.isFinite(shippingMinor) ? "Enter a valid amount" : "",
    fulfil: !f.deliveryEnabled && !f.pickupEnabled ? "Offer delivery, pickup, or both" : "",
  };
  const invalid = Object.values(errors).some(Boolean);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const err = (k: keyof typeof errors) => touched && errors[k] ? <p className="mt-1 text-[11px] text-destructive" role="alert">{errors[k]}</p> : null;

  function save() {
    setTouched(true);
    if (invalid) return;
    const data: CommerceShopInput = {
      name: f.name.trim(), slug: f.slug, currency: cur, category: f.category.trim(), description: f.description.trim(), policies: f.policies.trim(),
      contact: f.contact.trim(), pickupDetails: f.pickupDetails.trim(), shippingMinor, deliveryEnabled: f.deliveryEnabled, pickupEnabled: f.pickupEnabled, isPublished: f.isPublished,
      ...(logo ? { logoMediaId: logo.id } : logoRemoved ? { logoMediaId: null } : {}),
    };
    if (shop) update.mutate({ shopId: shop.id, data }); else create.mutate({ data });
  }

  const logoSrc = logo ? logo.url : logoRemoved ? undefined : mediaSrc(shop?.logo);
  return <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
    <div className="flex items-center gap-4">
      <Thumb src={logoSrc} alt="Shop logo" className="h-20 w-20 rounded-2xl border" />
      <div><Label>Logo</Label><div className="mt-1 flex items-center gap-2"><MediaPicker purpose="product" value={undefined} onChange={(m) => { setLogo(m); setLogoRemoved(false); }} />{logoSrc ? <Button type="button" size="sm" variant="ghost" onClick={() => { setLogo(undefined); setLogoRemoved(true); }}><X className="mr-1 h-3.5 w-3.5" />Remove</Button> : null}</div><p className="mt-1 text-[11px] text-muted-foreground">Square images look best.</p></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="shop-name">Shop name</Label><Input id="shop-name" maxLength={100} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value, slug: x.slugTouched ? x.slug : slugify(e.target.value) }))} aria-invalid={touched && !!errors.name} data-testid="input-shop-name" />{err("name")}</div>
      <div><Label htmlFor="shop-slug">Shop handle</Label><Input id="shop-slug" maxLength={60} className="font-mono" value={f.slug} onChange={(e) => setF((x) => ({ ...x, slug: slugify(e.target.value), slugTouched: true }))} aria-invalid={touched && !!errors.slug} data-testid="input-shop-slug" />{err("slug")}</div>
      <div><Label htmlFor="shop-category">Category</Label><Input id="shop-category" maxLength={80} value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Fashion, home, beauty" aria-invalid={touched && !!errors.category} data-testid="input-shop-category" />{err("category")}</div>
      <div><Label htmlFor="shop-currency">Currency</Label><Input id="shop-currency" maxLength={3} className="font-mono uppercase" disabled={currencyLocked} value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} aria-describedby="cur-hint" aria-invalid={touched && !!errors.currency} data-testid="input-shop-currency" /><p id="cur-hint" className="mt-1 text-[11px] text-muted-foreground">{currencyLocked ? "Locked because this shop already has products." : "All prices in this shop use this currency. It locks once you add products."}</p>{err("currency")}</div>
    </div>
    <div><Label htmlFor="shop-desc">About the shop</Label><Textarea id="shop-desc" rows={3} maxLength={3000} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
    <fieldset className="rounded-2xl border p-4">
      <legend className="px-1 text-sm font-semibold">Fulfillment</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-sm">Delivery<Switch checked={f.deliveryEnabled} onCheckedChange={(v) => set("deliveryEnabled", v)} data-testid="switch-delivery" /></label>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-sm">Pickup<Switch checked={f.pickupEnabled} onCheckedChange={(v) => set("pickupEnabled", v)} data-testid="switch-pickup" /></label>
        {f.deliveryEnabled ? <div><Label htmlFor="shop-ship">Flat shipping fee ({cur || "---"})</Label><Input id="shop-ship" type="number" min="0" step="any" value={f.shipping} onChange={(e) => set("shipping", e.target.value)} />{err("shipping")}</div> : null}
        {f.pickupEnabled ? <div className={f.deliveryEnabled ? "" : "sm:col-span-2"}><Label htmlFor="shop-pickup">Pickup details</Label><Input id="shop-pickup" maxLength={1000} value={f.pickupDetails} onChange={(e) => set("pickupDetails", e.target.value)} placeholder="Address and hours" /></div> : null}
      </div>
      {err("fulfil")}
    </fieldset>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="shop-policies">Policies</Label><Textarea id="shop-policies" rows={4} maxLength={5000} value={f.policies} onChange={(e) => set("policies", e.target.value)} placeholder="Returns, exchanges, manual payment instructions" /></div>
      <div><Label htmlFor="shop-contact">Contact</Label><Textarea id="shop-contact" rows={4} maxLength={500} value={f.contact} onChange={(e) => set("contact", e.target.value)} placeholder="How buyers reach you" /></div>
    </div>
    <label className="flex items-center justify-between gap-3 rounded-2xl border p-4 text-sm"><span><span className="block font-medium">Published</span><span className="text-xs text-muted-foreground">Unpublished shops are hidden from buyers.</span></span><Switch checked={f.isPublished} onCheckedChange={(v) => set("isPublished", v)} data-testid="switch-shop-published" /></label>
    <div className="flex justify-end"><Button type="submit" className="rounded-full px-6" disabled={busy} data-testid="button-save-shop">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Store className="mr-2 h-4 w-4" />}{shop ? "Save settings" : "Open my shop"}</Button></div>
  </form>;
}

export function CreateShopPanel({ onCreated }: { onCreated: (s: CommerceShop) => void }) {
  return <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
    <div className="rise relative overflow-hidden rounded-[2rem] bg-[hsl(var(--ink))] p-7 text-[hsl(224_35%_95%)]">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full opacity-40 blur-3xl" style={{ background: "var(--brand-gradient)" }} />
      <p className="relative font-mono text-[10px] uppercase tracking-[.24em] text-[hsl(var(--brand-cyan))]">Seller Center</p>
      <h2 className="relative mt-3 font-display text-4xl font-semibold leading-tight">Open a shop where your audience already is.</h2>
      <ul className="relative mt-6 space-y-3 text-sm text-white/75">
        <li>Sell from your profile, posts and clips with product tags.</li>
        <li>Run coupons and campaign links, and see real first-party funnels.</li>
        <li>Invite managers, fulfillment staff, marketers and creators.</li>
        <li>Manual payment only: you arrange payment with each buyer.</li>
      </ul>
    </div>
    <div className="rounded-[2rem] border bg-card p-5 sm:p-7"><Kicker>Step 1 of 1</Kicker><h3 className="mb-5 mt-1 font-display text-2xl font-semibold">Shop details</h3><ShopForm onSaved={onCreated} /></div>
  </div>;
}
