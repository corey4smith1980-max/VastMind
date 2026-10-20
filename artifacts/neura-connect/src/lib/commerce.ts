"use client";
import { useCallback, useEffect, useState } from "react";
import type { CommerceCheckoutInput, CommerceMedia, CommerceOrder, CommerceProduct } from "@workspace/api-client-react";
import { basePath } from "@/lib/base";

// ---------- Money: always minor units, currency-aware exponent ----------
export function exponent(currency: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { return 2; }
}
export function money(minor: number, currency: string) {
  const c = (currency || "USD").toUpperCase();
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(minor / 10 ** exponent(c)); }
  catch { return `${c} ${minor}`; }
}
export function toMinor(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return NaN;
  return Math.round(amount * 10 ** exponent(currency));
}
export function fromMinor(minor: number, currency: string) {
  const d = exponent(currency);
  return (minor / 10 ** d).toFixed(d);
}
export function validCurrency(code: string) {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try { new Intl.NumberFormat("en", { style: "currency", currency: code }).format(0); return true; } catch { return false; }
}

export function mediaSrc(media?: Pick<CommerceMedia, "url"> | null) {
  if (!media?.url) return undefined;
  const url = media.url;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (basePath && url.startsWith("/") && !url.startsWith(basePath) && !url.startsWith("/api")) return `${basePath}${url}`;
  return url;
}

export const ORDER_STATUS_LABEL: Record<CommerceOrder["status"], string> = {
  pending: "Awaiting seller", confirmed: "Confirmed", preparing: "Preparing", completed: "Completed", cancelled: "Cancelled", returned: "Returned",
};
export const ORDER_STATUS_TONE: Record<CommerceOrder["status"], string> = {
  pending: "bg-[hsl(var(--brand-violet)/.12)] text-[hsl(var(--brand-violet))]",
  confirmed: "bg-primary/10 text-primary",
  preparing: "bg-[hsl(var(--brand-cyan)/.16)] text-[hsl(192_90%_28%)] dark:text-[hsl(var(--brand-cyan))]",
  completed: "bg-online/12 text-online",
  cancelled: "bg-destructive/10 text-destructive",
  returned: "bg-[hsl(var(--brand-magenta)/.12)] text-[hsl(var(--brand-magenta))]",
};
export function humanAction(a: string) { return a.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()); }
export function shortId(id: string) { return id.replace(/-/g, "").slice(0, 8).toUpperCase(); }

// ---------- CSV ----------
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function newIdempotencyKey() {
  try { return `chk-${crypto.randomUUID()}`; } catch { return `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`; }
}

// ---------- Cart: per-user, one shop/seller/currency boundary ----------
export type CartLine = { productId: string; variantId?: string; quantity: number; title: string; variantLabel?: string; unitPriceMinor: number; image?: string; maxQty: number };
/** An order submission whose outcome is not yet known. Exact body + idempotency key, replayed verbatim on retry. */
export type PendingAttempt = { body: CommerceCheckoutInput & { idempotencyKey: string; expectedTotalMinor: number }; createdAt: string };
export type Cart = { sellerId: string; sellerName: string; shopId?: string; currency: string; lines: CartLine[]; campaignId?: string; couponCode?: string; pending?: PendingAttempt };
export class CartStorageError extends Error {}
const EVT = "vastmind-cart-change";
const keyFor = (userId: string) => `vastmind-commerce-cart:${userId}`;

function read(userId: string): Cart | null {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(userId)) ?? "null");
    if (raw && typeof raw === "object" && Array.isArray(raw.lines) && typeof raw.sellerId === "string" && typeof raw.currency === "string") {
      const lines = (raw.lines as CartLine[]).filter((l) => l && typeof l.productId === "string" && Number.isInteger(l.quantity) && l.quantity > 0);
      return lines.length ? { ...raw, lines } : null;
    }
  } catch { /* unreadable cart is treated as empty */ }
  return null;
}

export function useCart(userId: string) {
  const [cart, setCartState] = useState<Cart | null>(null);
  useEffect(() => {
    setCartState(read(userId));
    const sync = () => setCartState(read(userId));
    window.addEventListener(EVT, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, [userId]);
  const write = useCallback((next: Cart | null) => {
    let ok = true;
    try { if (next && next.lines.length) localStorage.setItem(keyFor(userId), JSON.stringify(next)); else localStorage.removeItem(keyFor(userId)); } catch { ok = false; }
    setCartState(next && next.lines.length ? next : null);
    window.dispatchEvent(new Event(EVT));
    return ok;
  }, [userId]);

  /** Returns "conflict" when the item belongs to another shop/seller/currency. */
  const add = useCallback((product: CommerceProduct, variantId: string | undefined, quantity: number, opts?: { replace?: boolean; campaignId?: string }) => {
    const current = read(userId);
    if (current?.pending) return "locked" as const;
    const variant = product.variants.find((v) => v.id === variantId);
    const conflict = current && (current.sellerId !== product.sellerId || (current.shopId ?? "") !== (product.shopId ?? "") || current.currency !== product.currency);
    if (conflict && !opts?.replace) return "conflict" as const;
    const base: Cart = current && !conflict ? current : { sellerId: product.sellerId, sellerName: product.shopName || product.sellerName, shopId: product.shopId, currency: product.currency, lines: [] };
    const maxQty = Math.min(99, variant ? variant.inventory : product.inventory);
    const existing = base.lines.find((l) => l.productId === product.id && (l.variantId ?? "") === (variantId ?? ""));
    const lines = existing
      ? base.lines.map((l) => l === existing ? { ...l, quantity: Math.min(maxQty, l.quantity + quantity), maxQty, unitPriceMinor: variant?.priceMinor ?? product.priceMinor } : l)
      : [...base.lines, { productId: product.id, variantId, quantity: Math.min(maxQty, quantity), title: product.title, variantLabel: variant?.label, unitPriceMinor: variant?.priceMinor ?? product.priceMinor, image: mediaSrc(product.gallery[0]), maxQty }];
    write({ ...base, lines, campaignId: opts?.campaignId ?? base.campaignId });
    return "added" as const;
  }, [userId, write]);

  const setQty = useCallback((productId: string, variantId: string | undefined, qty: number) => {
    const current = read(userId); if (!current || current.pending) return;
    write({ ...current, lines: current.lines.flatMap((l) => l.productId === productId && (l.variantId ?? "") === (variantId ?? "") ? (qty < 1 ? [] : [{ ...l, quantity: Math.min(l.maxQty || 99, qty) }]) : [l]) });
  }, [userId, write]);
  const patch = useCallback((p: Partial<Pick<Cart, "campaignId" | "couponCode">>) => { const c = read(userId); if (c && !c.pending) write({ ...c, ...p }); }, [userId, write]);
  /** Normal clear is refused while an attempt is unresolved; pass force only after confirmed success or explicit discard. */
  const clear = useCallback((force = false) => { const c = read(userId); if (c?.pending && !force) return false; write(null); return true; }, [userId, write]);
  /** Persist the exact attempt BEFORE sending. Throws if it cannot be stored and verified. */
  const beginAttempt = useCallback((body: PendingAttempt["body"]) => {
    const c = read(userId);
    if (!c) throw new CartStorageError("Your cart is no longer available.");
    if (c.pending) throw new CartStorageError("Another order attempt is still unresolved.");
    const attempt: PendingAttempt = { body, createdAt: new Date().toISOString() };
    const ok = write({ ...c, pending: attempt });
    const back = read(userId);
    if (!ok || back?.pending?.body.idempotencyKey !== body.idempotencyKey) {
      if (back?.pending?.body.idempotencyKey === body.idempotencyKey) write({ ...back, pending: undefined });
      throw new CartStorageError("This browser couldn't save your order attempt, so it wasn't sent. Free up storage or leave private browsing, then try again.");
    }
    return attempt;
  }, [userId, write]);
  /** Release after a definite rejection (4xx); keeps cart for editing. */
  const releaseAttempt = useCallback(() => { const c = read(userId); if (c?.pending) write({ ...c, pending: undefined }); }, [userId, write]);
  const count = cart?.lines.reduce((s, l) => s + l.quantity, 0) ?? 0;
  return { cart, add, setQty, patch, clear, beginAttempt, releaseAttempt, pending: cart?.pending, count };
}
