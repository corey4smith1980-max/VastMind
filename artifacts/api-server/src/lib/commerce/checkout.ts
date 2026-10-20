import { assert, blocked, type Query, type Row } from "../social";
import { COMMERCE_MONEY_LIMIT, discountAmount } from "../commerce-policy";
import { shopAccess } from "./shared";

/** Always reprice from locked database rows. Client totals are never authoritative. */
export async function buildQuote(b: Row, viewer: string, q: Query, reserve = false) {
  const ids = [...new Set<string>(b.items.map((i: Row) => i.productId))].sort();
  const initial = await q("SELECT * FROM shop_products WHERE id=ANY($1::text[]) ORDER BY id", [ids]);
  assert(initial.length === ids.length, 404, "A product is no longer available");
  const first = initial[0];
  assert(initial.every(p => p.seller_id === first.seller_id && p.currency === first.currency && p.shop_id === first.shop_id), 400, "Use one seller, storefront and currency per checkout");
  assert(first.seller_id !== viewer, 400, "You cannot order from your own shop");
  assert(!await blocked(viewer, first.seller_id, q), 403, "This seller is unavailable");
  const shop = first.shop_id ? await shopAccess(first.shop_id, viewer, q, undefined, reserve) : undefined;
  assert(!shop || shop.role === "buyer", 403, "Business collaborators cannot place orders in their own shop");
  if (shop) {
    assert(shop.is_published, 409, "This shop is not accepting orders");
    assert(b.fulfillment === "delivery" ? shop.delivery_enabled : shop.pickup_enabled, 400, "This fulfillment method is not available");
  } else assert(b.fulfillment === "pickup", 400, "This legacy listing supports seller-arranged pickup only");
  const products = await q(`SELECT * FROM shop_products WHERE id=ANY($1::text[]) ORDER BY id ${reserve ? "FOR UPDATE" : ""}`, [ids]);
  assert(products.every(p => p.shop_id === first.shop_id && p.currency === first.currency && p.seller_id === first.seller_id), 409, "The catalog changed. Review checkout again");
  const quantities = new Map<string, { productId: string; variantId?: string; quantity: number }>();
  for (const item of b.items) {
    const key = `${item.productId}:${item.variantId ?? ""}`;
    const old = quantities.get(key);
    const quantity = (old?.quantity ?? 0) + item.quantity;
    assert(quantity <= 99, 400, "Maximum 99 of each item per order");
    quantities.set(key, { ...item, quantity });
  }
  const items: Row[] = [];
  for (const item of [...quantities.values()].sort((a, b) => `${a.productId}${a.variantId}`.localeCompare(`${b.productId}${b.variantId}`))) {
    const p = products.find(p => p.id === item.productId)!;
    assert(p.is_published, 409, "A product is no longer published");
    const variants = await q(`SELECT * FROM commerce_variants WHERE product_id=$1 AND active ORDER BY id ${reserve ? "FOR UPDATE" : ""}`, [p.id]);
    const variant = item.variantId ? variants.find(v => v.id === item.variantId) : undefined;
    assert(!variants.length || variant, 400, `Choose a variant for ${p.title}`);
    assert(!item.variantId || variant, 400, "This variant is no longer available");
    const stock = variant?.inventory ?? p.inventory, price = variant?.price_minor ?? p.price_minor;
    assert(stock >= item.quantity, 409, `${p.title}${variant ? ` (${variant.label})` : ""} has only ${stock} available`);
    items.push({ productId: p.id, variantId: variant?.id, variantLabel: variant?.label, sku: variant?.sku,
      title: p.title, unitPriceMinor: price, quantity: item.quantity, lineTotalMinor: price * item.quantity });
  }
  const subtotal = items.reduce((n, i) => n + i.lineTotalMinor, 0);
  assert(Number.isSafeInteger(subtotal) && subtotal > 0 && subtotal <= COMMERCE_MONEY_LIMIT, 400, "Order amount is too large");
  let campaign: Row | undefined;
  if (b.campaignId) {
    [campaign] = await q("SELECT * FROM commerce_campaigns WHERE id=$1 AND shop_id=$2 AND active", [b.campaignId, shop?.id ?? null]);
    assert(campaign && (!campaign.product_id || items.some(i => i.productId === campaign!.product_id)), 400, "Campaign is unavailable for these items");
    if (campaign.creator_id) assert((await q("SELECT 1 FROM commerce_team WHERE shop_id=$1 AND user_id=$2 AND role='creator'", [shop!.id, campaign.creator_id])).length, 400, "Creator approval has ended");
  }
  let coupon: Row | undefined, discount = 0;
  if (b.couponCode?.trim()) {
    assert(shop, 400, "Coupons require a storefront");
    [coupon] = await q(`SELECT * FROM commerce_coupons WHERE shop_id=$1 AND code=$2 ${reserve ? "FOR UPDATE" : ""}`, [shop.id, b.couponCode.trim().toUpperCase()]);
    assert(coupon && coupon.active && new Date(coupon.expires_at).getTime() > Date.now(), 400, "Coupon is invalid or expired");
    assert(coupon.currency === first.currency && subtotal >= coupon.min_spend_minor, 400, "Coupon minimum spend or currency is not satisfied");
    const [used] = await q(`SELECT count(*)::int AS total,count(*) FILTER(WHERE user_id=$2)::int AS buyer FROM commerce_redemptions WHERE coupon_id=$1`, [coupon.id, viewer]);
    assert(used.total < coupon.max_redemptions && used.buyer < coupon.per_buyer_limit, 409, "Coupon redemption limit reached");
    const eligible = items.filter(i => !coupon!.product_ids.length || coupon!.product_ids.includes(i.productId)).reduce((n, i) => n + i.lineTotalMinor, 0);
    assert(eligible > 0, 400, "Coupon does not apply to these products");
    discount = discountAmount(coupon.kind, coupon.value, eligible);
  }
  const shipping = b.fulfillment === "delivery" ? shop!.shipping_minor : 0;
  const total = subtotal - discount + shipping;
  assert(total <= COMMERCE_MONEY_LIMIT, 400, "Order amount is too large");
  return {
    shopId: shop?.id, sellerId: first.seller_id, currency: first.currency, items,
    subtotalMinor: subtotal, discountMinor: discount, shippingMinor: shipping, totalMinor: total,
    paymentMethod: "manual", fulfillment: b.fulfillment, couponId: coupon?.id, campaignId: campaign?.id,
  };
}
