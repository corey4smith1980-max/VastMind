"use client";
import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Flag, Loader2, Minus, Plus, Share2, ShoppingBag, Store } from "lucide-react";
import {
  useCommerceGetProduct, getCommerceGetProductQueryKey, useCommerceSaveProduct, useCommerceReviewProduct,
  useCommerceReport, useCommerceRecordEvent, type CommerceReportInputKind,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/states";
import { useMe } from "@/lib/me";
import { useToast } from "@/hooks/use-toast";
import { useInvalidate } from "@/lib/realtime";
import { errMessage, relTime } from "@/lib/format";
import { basePath } from "@/lib/base";
import { mediaSrc, money, useCart } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { Kicker, Stars, Thumb } from "./bits";

export function ReportDialog({ kind, targetId, open, onOpenChange }: { kind: CommerceReportInputKind; targetId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const report = useCommerceReport({ mutation: {
    onSuccess: () => { setReason(""); onOpenChange(false); toast({ title: "Report sent", description: "Our safety team reviews every commerce report." }); },
    onError: (e) => toast({ title: "Couldn't send report", description: errMessage(e), variant: "destructive" }),
  } });
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle>Report this {kind}</DialogTitle><DialogDescription>Tell us what is wrong: counterfeit goods, misleading claims, prohibited items or seller conduct.</DialogDescription></DialogHeader>
      <Label htmlFor="report-reason">Reason</Label>
      <Textarea id="report-reason" rows={4} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby="report-hint" data-testid="input-report-reason" />
      <p id="report-hint" className="text-[11px] text-muted-foreground">At least 5 characters.</p>
      <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="destructive" disabled={reason.trim().length < 5 || report.isPending} onClick={() => report.mutate({ data: { kind, targetId, reason: reason.trim() } })} data-testid="button-submit-report">{report.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Send report</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function ProductDetail({ productId, campaignId, onOpenShop, onOpenCart, compact }: { productId: string; campaignId?: string; onOpenShop?: (shopId: string) => void; onOpenCart?: () => void; compact?: boolean }) {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const cart = useCart(me.id);
  const q = useCommerceGetProduct(productId, { query: { queryKey: getCommerceGetProductQueryKey(productId), enabled: !!productId } });
  const p = q.data;
  const [variantId, setVariantId] = useState<string>();
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const viewed = useRef<string | null>(null);
  const event = useCommerceRecordEvent();
  const eventRef = useRef(event.mutate); eventRef.current = event.mutate;

  useEffect(() => {
    if (p?.shopId && viewed.current !== p.id) { viewed.current = p.id; eventRef.current({ data: { kind: "view", shopId: p.shopId, productId: p.id, ...(campaignId ? { campaignId } : {}) } }); }
  }, [p?.id, p?.shopId, campaignId]);
  useEffect(() => { if (p && p.variants.length && !variantId) setVariantId(p.variants.find((v) => v.inventory > 0)?.id ?? p.variants[0].id); }, [p, variantId]);

  const save = useCommerceSaveProduct({ mutation: {
    onSuccess: (r) => { invalidate("/api/commerce/products"); toast({ title: r.saved ? "Saved for later" : "Removed from saved" }); },
    onError: (e) => toast({ title: "Couldn't update saved items", description: errMessage(e), variant: "destructive" }),
  } });
  const reviewM = useCommerceReviewProduct({ mutation: {
    onSuccess: () => { setReview(""); invalidate("/api/commerce/products"); toast({ title: "Review published", description: "Thanks for helping other buyers." }); },
    onError: (e) => toast({ title: "Couldn't publish review", description: errMessage(e), variant: "destructive" }),
  } });

  if (q.isLoading) return <div className="grid gap-5 md:grid-cols-2" aria-busy="true" aria-label="Loading product"><Skeleton className="aspect-square rounded-3xl" /><div className="space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-3/4" /><Skeleton className="h-7 w-28" /><Skeleton className="h-24" /><Skeleton className="h-12 rounded-full" /></div></div>;
  if (q.isError || !p) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const variant = p.variants.find((v) => v.id === variantId);
  const price = variant?.priceMinor ?? p.priceMinor;
  const stock = variant ? variant.inventory : p.inventory;
  const own = p.sellerId === me.id;
  const needVariant = p.variants.length > 0 && !variant;

  function addToCart(replace = false) {
    if (!p) return;
    const r = cart.add(p, variant?.id, qty, { replace, campaignId });
    if (r === "locked") { toast({ title: "Checkout in progress", description: "Resolve your pending order in the cart before changing it.", variant: "destructive" }); onOpenCart?.(); return; }
    if (r === "conflict") { setConflict(true); return; }
    setConflict(false);
    if (p.shopId) eventRef.current({ data: { kind: "add_to_cart", shopId: p.shopId, productId: p.id, ...(campaignId ? { campaignId } : {}) } });
    toast({ title: "Added to cart", description: `${qty} x ${p.title}${variant ? ` (${variant.label})` : ""}` });
  }
  async function share() {
    const url = `${window.location.origin}${basePath}/shop?product=${encodeURIComponent(p!.id)}${p!.shopId ? `&shop=${encodeURIComponent(p!.shopId)}` : ""}`;
    try { if (navigator.share) await navigator.share({ title: p!.title, url }); else { await navigator.clipboard.writeText(url); toast({ title: "Product link copied" }); } }
    catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) toast({ title: "Couldn't share", description: errMessage(e), variant: "destructive" }); }
  }

  return <div className={cn("grid gap-6", !compact && "md:grid-cols-[1.05fr_1fr]")} data-testid={`detail-product-${p.id}`}>
    <div>
      <div className="relative overflow-hidden rounded-[1.8rem] border bg-muted">
        <Thumb key={img} src={mediaSrc(p.gallery[img])} alt={p.gallery[img]?.name || p.title} className="rise aspect-square w-full" />
        {stock === 0 ? <span className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold">Sold out</span> : null}
      </div>
      {p.gallery.length > 1 ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Product photos">
        {p.gallery.map((m, i) => <button key={m.id} role="tab" aria-selected={img === i} aria-label={`Photo ${i + 1}`} onClick={() => setImg(i)} className={cn("h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all", img === i ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}><Thumb src={mediaSrc(m)} alt="" className="h-full w-full" /></button>)}
      </div> : null}
    </div>

    <div className="min-w-0">
      <Kicker>{p.category}</Kicker>
      <h2 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl" data-testid="text-product-title">{p.title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {p.reviewCount ? <span className="flex items-center gap-1.5"><Stars value={p.rating} /> {p.rating.toFixed(1)} ({p.reviewCount})</span> : <span>No reviews yet</span>}
        {p.shopId && onOpenShop ? <button onClick={() => onOpenShop(p.shopId!)} className="flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline" data-testid="link-product-shop"><Store className="h-3.5 w-3.5" />{p.shopName || p.sellerName}</button> : <span>by {p.shopName || p.sellerName}</span>}
        {!p.shopId ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Classic listing</span> : null}
      </div>
      <p className="mt-4 font-display text-3xl font-bold tabular-nums" data-testid="text-product-price">{money(price, p.currency)}</p>
      <p className={cn("mt-1 text-xs", stock > 0 && stock <= 5 ? "text-[hsl(var(--brand-magenta))]" : "text-muted-foreground")}>{stock === 0 ? "Out of stock" : stock <= 5 ? `Only ${stock} left` : `${stock} in stock`}</p>

      {p.variants.length ? <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium">Option</legend>
        <div className="flex flex-wrap gap-2">
          {p.variants.map((v) => <button key={v.id} type="button" aria-pressed={variantId === v.id} disabled={v.inventory === 0} onClick={() => { setVariantId(v.id); setQty(1); }}
            className={cn("rounded-full border px-4 py-2 text-sm transition-all active:scale-95 disabled:opacity-40 disabled:line-through", variantId === v.id ? "border-primary bg-primary text-primary-foreground shadow-[0_6px_20px_-8px_hsl(var(--primary))]" : "hover:border-primary")} data-testid={`button-variant-${v.id}`}>
            {v.label}{v.priceMinor !== p.priceMinor ? <span className="ml-1.5 opacity-75">{money(v.priceMinor, p.currency)}</span> : null}
          </button>)}
        </div>
      </fieldset> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-full border" role="group" aria-label="Quantity">
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((n) => n - 1)}><Minus className="h-4 w-4" /></Button>
          <span className="w-8 text-center tabular-nums" aria-live="polite">{qty}</span>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Increase quantity" disabled={qty >= Math.min(99, stock)} onClick={() => setQty((n) => n + 1)}><Plus className="h-4 w-4" /></Button>
        </div>
        <Button className="h-11 flex-1 rounded-full text-base" disabled={own || stock === 0 || needVariant} onClick={() => addToCart()} data-testid="button-add-to-cart"><ShoppingBag className="mr-2 h-4 w-4" />{own ? "Your listing" : stock === 0 ? "Unavailable" : "Add to cart"}</Button>
        <Button size="icon" variant="outline" className="h-11 w-11 rounded-full" aria-pressed={p.saved} aria-label={p.saved ? "Remove from saved" : "Save product"} disabled={save.isPending} onClick={() => save.mutate({ productId: p.id, data: { saved: !p.saved } })} data-testid="button-save-product">{p.saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}</Button>
        <Button size="icon" variant="outline" className="h-11 w-11 rounded-full" aria-label="Share product" onClick={() => void share()}><Share2 className="h-4 w-4" /></Button>
      </div>
      {conflict ? <div role="alert" className="rise mt-3 rounded-2xl border border-[hsl(var(--brand-violet)/.4)] bg-[hsl(var(--brand-violet)/.07)] p-3 text-sm">
        <p className="font-medium">Your cart holds items from another shop.</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Each order is placed with one seller in one currency. Start a new cart with this item?</p>
        <div className="mt-2 flex gap-2"><Button size="sm" className="rounded-full" onClick={() => addToCart(true)} data-testid="button-replace-cart">Start new cart</Button>{onOpenCart ? <Button size="sm" variant="ghost" onClick={onOpenCart}>Review current cart</Button> : <Button size="sm" variant="ghost" onClick={() => setConflict(false)}>Keep current cart</Button>}</div>
      </div> : null}
      {cart.count && onOpenCart ? <button onClick={onOpenCart} className="mt-3 text-xs font-medium text-primary underline-offset-4 hover:underline" data-testid="link-view-cart">View cart ({cart.count})</button> : null}

      <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/85">{p.description || "The seller hasn't added a description yet."}</p>
      <p className="mt-4 rounded-2xl bg-muted/70 p-3 text-[11px] leading-relaxed text-muted-foreground">Payment is arranged manually with the seller after they confirm your order. VastMind never asks for card or bank details.</p>

      <section className="mt-8" aria-labelledby={`reviews-${p.id}`}>
        <div className="flex items-center justify-between"><h3 id={`reviews-${p.id}`} className="font-display text-xl font-semibold">Reviews</h3><button onClick={() => setReportOpen(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" data-testid="button-report-product"><Flag className="h-3.5 w-3.5" />Report</button></div>
        {p.reviewEligible ? <form className="mt-3 rounded-2xl border p-3" onSubmit={(e) => { e.preventDefault(); if (review.trim()) reviewM.mutate({ productId: p.id, data: { rating, content: review.trim() } }); }}>
          <fieldset><legend className="text-sm font-medium">Your rating</legend>
            <div className="mt-1 flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={rating === n} onClick={() => setRating(n)} className="transition-transform hover:scale-110"><Stars value={n <= rating ? 1 : 0} size="h-5 w-5" /></button>)}</div>
          </fieldset>
          <Label htmlFor={`review-${p.id}`} className="mt-3 block">What did you think?</Label>
          <Textarea id={`review-${p.id}`} rows={3} maxLength={2000} value={review} onChange={(e) => setReview(e.target.value)} data-testid="input-review" />
          <Button type="submit" size="sm" className="mt-2 rounded-full" disabled={!review.trim() || reviewM.isPending} data-testid="button-submit-review">{reviewM.isPending ? "Publishing..." : "Publish review"}</Button>
        </form> : null}
        <div className="mt-3 space-y-3">
          {p.reviews.length === 0 ? <p className="text-sm text-muted-foreground">Reviews appear after verified buyers complete an order.</p> : null}
          {p.reviews.map((r) => <div key={`${r.userId}-${r.createdAt}`} className="rounded-2xl border p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{r.name}</span><Stars value={r.rating} /></div><p className="mt-1 text-sm text-foreground/85">{r.content}</p><p className="mt-1 text-[10px] text-muted-foreground">{relTime(r.createdAt)}</p></div>)}
        </div>
      </section>
    </div>
    <ReportDialog kind="product" targetId={p.id} open={reportOpen} onOpenChange={setReportOpen} />
  </div>;
}
