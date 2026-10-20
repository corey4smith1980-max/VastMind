import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommerceCheckoutInput, CommerceProduct, CommerceVariant } from '@workspace/api-client-react';
import { useAppStore } from '@/state/AppStore';

export type CartLine = {
  productId: string; variantId?: string; variantLabel?: string; title: string;
  unitMinor: number; quantity: number; maxQty: number;
};
export type Cart = {
  shopId?: string; shopName?: string; sellerId?: string; sellerName?: string; currency?: string;
  lines: CartLine[]; campaignId?: string; couponCode?: string;
  /** Unresolved order attempt: exact body + idempotency key, persisted so retries never mint a new key. */
  attempt?: { body: CommerceCheckoutInput & { idempotencyKey: string } };
};
const empty: Cart = { lines: [] };
let cart: Cart = empty;
let owner: string | null = null;
const subs = new Set<() => void>();
const keyFor = (uid: string) => `vastmind.cart.v2.${uid}`;

function emit(next: Cart) {
  cart = next;
  subs.forEach(f => f());
  if (owner) void AsyncStorage.setItem(keyFor(owner), JSON.stringify(next)).catch(() => {});
}
async function load(uid: string) {
  if (owner === uid) return;
  owner = uid; cart = empty; subs.forEach(f => f());
  try { const raw = await AsyncStorage.getItem(keyFor(uid)); if (raw && owner === uid) { cart = { ...empty, ...JSON.parse(raw) }; subs.forEach(f => f()); } }
  catch { /* storage unavailable: memory cart only */ }
}

export const cartActions = {
  /** Returns an error message, or null when the line was added. */
  add(product: CommerceProduct, variant: CommerceVariant | undefined, quantity: number, me?: string): string | null {
    if (cart.attempt) return 'An order from your cart is still being confirmed. Open your cart to finish it first.';
    if (product.sellerId === me) return "You can't buy from your own shop.";
    const stock = variant ? variant.inventory : product.inventory;
    if (stock < 1) return 'This option is sold out.';
    if (product.variants.length && !variant) return 'Choose an option first.';
    if (cart.lines.length) {
      if (cart.sellerId !== product.sellerId || (cart.shopId ?? '') !== (product.shopId ?? '')) return `Your cart holds items from ${cart.shopName ?? cart.sellerName}. One shop per order: check out or clear it first.`;
      if (cart.currency !== product.currency) return `Your cart is priced in ${cart.currency}. Items must share one currency.`;
    }
    const id = product.id + (variant?.id ?? '');
    const existing = cart.lines.find(l => l.productId + (l.variantId ?? '') === id);
    const lines = existing
      ? cart.lines.map(l => l === existing ? { ...l, quantity: Math.min(stock, 99, l.quantity + quantity), maxQty: Math.min(stock, 99) } : l)
      : [...cart.lines, { productId: product.id, variantId: variant?.id, variantLabel: variant?.label, title: product.title, unitMinor: variant?.priceMinor ?? product.priceMinor, quantity: Math.min(stock, 99, quantity), maxQty: Math.min(stock, 99) }];
    if (lines.length > 30) return 'Orders can include up to 30 lines.';
    emit({ ...cart, lines, shopId: product.shopId, shopName: product.shopName ?? product.sellerName, sellerId: product.sellerId, sellerName: product.sellerName, currency: product.currency });
    return null;
  },
  setQty(index: number, quantity: number) {
    if (cart.attempt) return;
    emit({ ...cart, lines: cart.lines.map((l, i) => i === index ? { ...l, quantity: Math.max(1, Math.min(l.maxQty, quantity)) } : l) });
  },
  remove(index: number) {
    if (cart.attempt) return;
    const lines = cart.lines.filter((_, i) => i !== index);
    emit(lines.length ? { ...cart, lines } : { ...empty, campaignId: cart.campaignId, couponCode: cart.couponCode });
  },
  attribution(campaignId?: string, couponCode?: string) { if (cart.attempt) return; emit({ ...cart, campaignId, couponCode: couponCode ?? cart.couponCode }); },
  setCoupon(couponCode?: string) { if (cart.attempt) return; emit({ ...cart, couponCode }); },
  clear() { emit(empty); },
  beginAttempt(body: CommerceCheckoutInput & { idempotencyKey: string }) { if (!cart.attempt) emit({ ...cart, attempt: { body } }); return (cart.attempt ?? { body }).body; },
  endAttempt() { if (cart.attempt) emit({ ...cart, attempt: undefined }); },
};

export function useCart() {
  const { profile } = useAppStore();
  useEffect(() => { if (profile?.id) void load(profile.id); }, [profile?.id]);
  const value = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => cart, () => cart);
  const count = value.lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = value.lines.reduce((n, l) => n + l.quantity * l.unitMinor, 0);
  return { cart: value, count, subtotal, me: profile?.id, ...cartActions };
}
