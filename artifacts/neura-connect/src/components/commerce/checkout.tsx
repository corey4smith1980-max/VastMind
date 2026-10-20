"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Lock, MapPin, Minus, Plus, ReceiptText, ShoppingBag, Trash2, Truck } from "lucide-react";
import {
  useCommerceQuote, useCommercePlaceOrder, useCommerceGetShop, getCommerceGetShopQueryKey,
  type CommerceCheckoutInput, type CommerceOrder, type CommerceQuote,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/states";
import { useMe } from "@/lib/me";
import { useToast } from "@/hooks/use-toast";
import { useInvalidate } from "@/lib/realtime";
import { errMessage } from "@/lib/format";
import { money, newIdempotencyKey, useCart } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { Kicker, Thumb } from "./bits";

export function Checkout({ onBrowse, onPlaced, onOpenProduct, onCheckOrders }: { onBrowse: () => void; onPlaced: (o: CommerceOrder) => void; onOpenProduct: (id: string) => void; onCheckOrders: () => void }) {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const { cart, setQty, patch, clear, beginAttempt, releaseAttempt } = useCart(me.id);
  const shopId = cart?.shopId ?? "";
  const shop = useCommerceGetShop(shopId, { query: { queryKey: getCommerceGetShopQueryKey(shopId), enabled: !!shopId } });
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [recipientName, setRecipient] = useState(me.name ?? "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [buyerNote, setNote] = useState("");
  const [coupon, setCoupon] = useState("");
  const [quoted, setQuoted] = useState<{ sig: string; quote: CommerceQuote } | null>(null);
  const [payAck, setPayAck] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => { if (cart?.couponCode && !coupon) setCoupon(cart.couponCode); }, [cart?.couponCode, coupon]);
  useEffect(() => { if (cart && !cart.shopId && fulfillment === "delivery") setFulfillment("pickup"); }, [cart, fulfillment]);
  useEffect(() => {
    const s = shop.data; if (!s) return;
    if (fulfillment === "delivery" && !s.deliveryEnabled && s.pickupEnabled) setFulfillment("pickup");
    if (fulfillment === "pickup" && !s.pickupEnabled && s.deliveryEnabled) setFulfillment("delivery");
  }, [shop.data, fulfillment]);

  const payload = useMemo<CommerceCheckoutInput | null>(() => cart ? {
    items: cart.lines.map((l) => ({ productId: l.productId, ...(l.variantId ? { variantId: l.variantId } : {}), quantity: l.quantity })),
    fulfillment, recipientName: recipientName.trim(), phone: phone.trim(),
    ...(fulfillment === "delivery" ? { address: address.trim() } : {}),
    ...(buyerNote.trim() ? { buyerNote: buyerNote.trim() } : {}),
    ...(coupon.trim() ? { couponCode: coupon.trim() } : {}),
    ...(cart.campaignId ? { campaignId: cart.campaignId } : {}),
  } : null, [cart, fulfillment, recipientName, phone, address, buyerNote, coupon]);
  const sig = JSON.stringify(payload);
  const sigRef = useRef(sig); sigRef.current = sig;
  // Any change to the order invalidates the authoritative quote and starts a new attempt.
  useEffect(() => { if (!cart?.pending) setQuoted(null); }, [sig, cart?.pending]);
  // A quote is only valid for the exact payload it was requested with.
  const quote = quoted && quoted.sig === sig ? quoted.quote : null;

  const quoteM = useCommerceQuote({ mutation: {
    onError: (e) => toast({ title: "Couldn't price your order", description: errMessage(e), variant: "destructive" }),
  } });
  const place = useCommercePlaceOrder({ mutation: {
    onSuccess: (order) => { clear(); attemptKey.current = null; invalidate("/api/commerce"); toast({ title: "Order placed", description: `${money(order.totalMinor, order.currency)}. The seller will confirm and arrange manual payment.` }); onPlaced(order); },
    onError: (e) => {
      const stale = (e as { status?: number } | null)?.status === 409;
      if (stale) { setQuoted(null); attemptKey.current = null; }
      toast({ title: stale ? "Prices or stock changed" : "Order not placed", description: stale ? "Review the total again to see the current amount before ordering." : `${errMessage(e)} Your cart is kept; you can try again safely.`, variant: "destructive" });
    },
  } });

  if (!cart) return <EmptyState icon={ShoppingBag} title="Your cart is empty" body="Add products from a shop or a tagged post. Each cart holds one shop in one currency." action={<Button className="rounded-full" onClick={onBrowse} data-testid="button-browse">Browse the market</Button>} />;

  const s = shop.data;
  const canDeliver = !!shopId && (!s || s.deliveryEnabled);
  const canPickup = !s || s.pickupEnabled;
  const missing = !recipientName.trim() || !phone.trim() || (fulfillment === "delivery" && !address.trim());
  const estimate = cart.lines.reduce((t, l) => t + l.unitPriceMinor * l.quantity, 0);

  function review() { setTouched(true); if (!payload || missing) return; const reqSig = sig;
    quoteM.mutate({ data: payload }, { onSuccess: (q) => {
      if (sigRef.current !== reqSig) return; // buyer changed the order while pricing; ignore this response
      setQuoted({ sig: reqSig, quote: q });
      if (!attemptKey.current) attemptKey.current = newIdempotencyKey();
    } }); }
  function submit() { if (!payload || !quote || !payAck || !attemptKey.current || place.isPending) return; place.mutate({ data: { ...payload, idempotencyKey: attemptKey.current, expectedTotalMinor: quote.totalMinor } }); }
  const locked = place.isPending;

  return <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
    <section aria-labelledby="cart-h" className="space-y-4">
      <div className="flex items-end justify-between gap-3"><div><Kicker>One shop · {cart.currency}</Kicker><h2 id="cart-h" className="mt-1 font-display text-3xl font-semibold">{cart.sellerName}</h2></div><Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => clear()} disabled={locked || !!cart.pending} data-testid="button-clear-cart"><Trash2 className="mr-1 h-4 w-4" />Clear</Button></div>
      <ul className="space-y-2">
        {cart.lines.map((l) => <li key={`${l.productId}-${l.variantId ?? ""}`} className="rise flex items-center gap-3 rounded-2xl border bg-card p-3" data-testid={`row-cart-${l.productId}`}>
          <button onClick={() => onOpenProduct(l.productId)} aria-label={`Open ${l.title}`}><Thumb src={l.image} alt="" className="h-16 w-16 rounded-xl" /></button>
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{l.title}</p>{l.variantLabel ? <p className="text-xs text-muted-foreground">{l.variantLabel}</p> : null}<p className="text-xs text-muted-foreground">{money(l.unitPriceMinor, cart.currency)} each (estimate)</p></div>
          <div className="flex items-center rounded-full border">
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label={`Decrease ${l.title}`} disabled={locked} onClick={() => setQty(l.productId, l.variantId, l.quantity - 1)}><Minus className="h-3.5 w-3.5" /></Button>
            <span className="w-6 text-center text-sm tabular-nums">{l.quantity}</span>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label={`Increase ${l.title}`} disabled={locked || l.quantity >= (l.maxQty || 99)} onClick={() => setQty(l.productId, l.variantId, l.quantity + 1)}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </li>)}
      </ul>

      <form className="rounded-[1.6rem] border bg-card p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); review(); }} noValidate>
        <fieldset disabled={locked} className="space-y-4 disabled:opacity-60" aria-busy={locked}>
        <fieldset><legend className="mb-2 text-sm font-semibold">How do you want it?</legend>
          <div className="grid grid-cols-2 gap-2">
            {([["delivery", "Delivery", Truck, canDeliver], ["pickup", "Pickup", MapPin, canPickup]] as const).map(([k, label, Icon, ok]) => <button key={k} type="button" disabled={!ok} aria-pressed={fulfillment === k} onClick={() => setFulfillment(k)} className={cn("flex items-center gap-2 rounded-2xl border p-3 text-left text-sm transition-all disabled:opacity-40", fulfillment === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/60")} data-testid={`button-fulfillment-${k}`}><Icon className="h-4 w-4 text-primary" /><span><span className="block font-medium">{label}</span><span className="text-[11px] text-muted-foreground">{!ok ? "Not offered" : k === "delivery" && s ? `Shipping ${money(s.shippingMinor, s.currency)}` : k === "pickup" ? "No shipping fee" : ""}</span></span></button>)}
          </div>
          {!shopId ? <p className="mt-2 rounded-xl bg-muted p-2.5 text-xs">Classic listing: pickup only, arranged directly with the seller.</p> : null}
          {fulfillment === "pickup" && s?.pickupDetails ? <p className="mt-2 rounded-xl bg-muted p-2.5 text-xs">{s.pickupDetails}</p> : null}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="co-name">Recipient name</Label><Input id="co-name" autoComplete="name" maxLength={150} value={recipientName} onChange={(e) => setRecipient(e.target.value)} aria-invalid={touched && !recipientName.trim()} data-testid="input-recipient" />{touched && !recipientName.trim() ? <p className="mt-1 text-[11px] text-destructive">Required</p> : null}</div>
          <div><Label htmlFor="co-phone">Phone</Label><Input id="co-phone" type="tel" autoComplete="tel" maxLength={80} value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={touched && !phone.trim()} data-testid="input-phone" />{touched && !phone.trim() ? <p className="mt-1 text-[11px] text-destructive">The seller needs a way to arrange payment</p> : null}</div>
        </div>
        {fulfillment === "delivery" ? <div><Label htmlFor="co-address">Delivery address</Label><Textarea id="co-address" autoComplete="street-address" rows={3} maxLength={1000} value={address} onChange={(e) => setAddress(e.target.value)} aria-invalid={touched && !address.trim()} data-testid="input-address" />{touched && !address.trim() ? <p className="mt-1 text-[11px] text-destructive">Required for delivery</p> : null}</div> : null}
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
          <div><Label htmlFor="co-coupon">Coupon code</Label><Input id="co-coupon" maxLength={40} value={coupon} onChange={(e) => { setCoupon(e.target.value.toUpperCase()); patch({ couponCode: e.target.value.toUpperCase() || undefined }); }} className="font-mono uppercase" data-testid="input-coupon" /></div>
          <div><Label htmlFor="co-note">Note for the seller</Label><Input id="co-note" maxLength={2000} value={buyerNote} onChange={(e) => setNote(e.target.value)} data-testid="input-buyer-note" /></div>
        </div>
        {cart.campaignId ? <p className="text-[11px] text-muted-foreground">Arrived from a shop campaign; it is credited when you order.</p> : null}
        <Button type="submit" variant="outline" className="w-full rounded-full" disabled={quoteM.isPending} data-testid="button-review-total">{quoteM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-2 h-4 w-4" />}{quote ? "Refresh total" : "Review total"}</Button>
        </fieldset>
      </form>
    </section>

    <aside className="lg:sticky lg:top-4 lg:self-start" aria-labelledby="summary-h">
      <div className="overflow-hidden rounded-[1.8rem] bg-[hsl(var(--ink))] text-[hsl(224_35%_95%)] shadow-[0_30px_80px_-40px_hsl(var(--brand-blue))]">
        <div className="h-1 w-full" style={{ background: "var(--brand-gradient)" }} />
        <div className="p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[hsl(var(--brand-cyan))]">{quote ? "Confirmed quote" : "Estimate"}</p>
          <h3 id="summary-h" className="mt-1 font-display text-2xl font-semibold">Order summary</h3>
          {quote ? <dl className="rise mt-4 space-y-2 text-sm" aria-live="polite">
            {quote.items.map((it) => <div key={`${it.productId}-${it.variantId ?? ""}`} className="flex justify-between gap-2 text-white/80"><dt className="truncate">{it.quantity} x {it.title}{it.variantLabel ? ` (${it.variantLabel})` : ""}</dt><dd className="tabular-nums">{money(it.lineTotalMinor, quote.currency)}</dd></div>)}
            <div className="flex justify-between border-t border-white/10 pt-2"><dt>Subtotal</dt><dd className="tabular-nums">{money(quote.subtotalMinor, quote.currency)}</dd></div>
            {quote.discountMinor ? <div className="flex justify-between text-[hsl(var(--brand-cyan))]"><dt>Discount</dt><dd className="tabular-nums">-{money(quote.discountMinor, quote.currency)}</dd></div> : null}
            <div className="flex justify-between"><dt>Shipping</dt><dd className="tabular-nums">{money(quote.shippingMinor, quote.currency)}</dd></div>
            <div className="flex items-baseline justify-between border-t border-white/10 pt-3"><dt className="font-semibold">Total</dt><dd className="font-display text-3xl font-bold tabular-nums" data-testid="text-quote-total">{money(quote.totalMinor, quote.currency)}</dd></div>
          </dl> : <div className="mt-4 text-sm text-white/70"><div className="flex justify-between"><span>Items</span><span className="tabular-nums">{money(estimate, cart.currency)}</span></div><p className="mt-3 text-xs text-white/55">Review the total to apply stock, coupon and shipping rules from the shop. You'll see the exact amount before placing the order.</p></div>}
          {quote ? <label className="mt-5 flex items-start gap-2.5 rounded-2xl border border-white/15 bg-white/5 p-3 text-xs leading-relaxed text-white/80">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand-cyan))]" checked={payAck} disabled={locked} onChange={(e) => setPayAck(e.target.checked)} data-testid="checkbox-manual-payment" />
            <span>I understand this places an order only. Nothing is charged in VastMind; I'll pay the seller directly by the method they confirm, and any refund is arranged with them.</span>
          </label> : null}
          <Button className="mt-4 h-12 w-full rounded-full text-base" disabled={!quote || !payAck || place.isPending} onClick={submit} data-testid="button-place-order">{place.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}{quote ? `Place order · ${money(quote.totalMinor, quote.currency)}` : "Review total first"}</Button>
          <p className="mt-3 text-[11px] leading-relaxed text-white/55">Payment method: manual. The seller confirms your order and arranges payment with you directly. No card details are collected and refunds are handled between you and the seller.</p>
        </div>
      </div>
    </aside>
  </div>;
}
