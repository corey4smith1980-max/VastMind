import { assert, blocked, query, uuid, type Query, type Row } from "../social";
import { mediaShape } from "../media";
import { pageOffset } from "../commerce-policy";

export const MANAGE = ["owner", "manager"];
export const ORDERS = ["owner", "manager", "fulfillment"];
export const MARKET = ["owner", "manager", "marketer"];
export const TAG = ["owner", "manager", "marketer", "creator"];
export async function shopAccess(id: string, viewer: string, q: Query = query, roles?: string[], lock = false) {
  const [shop] = await q(`SELECT s.*,u.name AS owner_name,
    CASE WHEN s.owner_id=$2 THEN 'owner' ELSE COALESCE(t.role,'buyer') END AS role
    FROM shop_stores s JOIN users u ON u.id=s.owner_id
    LEFT JOIN commerce_team t ON t.shop_id=s.id AND t.user_id=$2 WHERE s.id=$1 ${lock ? "FOR UPDATE OF s" : ""}`, [id, viewer]);
  assert(shop && !await blocked(viewer, shop.owner_id, q), 404, "Shop not found");
  assert(shop.is_published || shop.role !== "buyer", 404, "Shop is not published");
  if (roles) assert(roles.includes(shop.role), 403, "Your business role does not allow this action");
  return shop;
}
export async function shopShape(id: string, viewer: string, q: Query = query) {
  const s = await shopAccess(id, viewer, q);
  const [f] = await q(`SELECT count(*)::int AS n,COALESCE(bool_or(user_id=$2),false) AS following,
    COALESCE(bool_or(user_id=$2 AND marketing_opt_in),false) AS opted FROM commerce_followers WHERE shop_id=$1`, [id, viewer]);
  return {
    id: s.id, ownerId: s.owner_id, ownerName: s.owner_name, name: s.name, slug: s.slug, description: s.description,
    category: s.category, currency: s.currency, policies: s.policies, contact: s.contact, pickupDetails: s.pickup_details,
    shippingMinor: s.shipping_minor, deliveryEnabled: s.delivery_enabled, pickupEnabled: s.pickup_enabled,
    isPublished: s.is_published, logo: await mediaShape(s.logo_media_id, q),
    role: s.role, followerCount: f.n, following: f.following, marketingOptIn: f.opted, createdAt: s.created_at,
  };
}
export async function productAccess(id: string, viewer: string, q: Query = query, editing = false, lock = false): Promise<Row & { role: string }> {
  const [p] = await q(`SELECT p.*,u.name AS seller_name,s.name AS shop_name,s.is_published AS shop_published
    FROM shop_products p JOIN users u ON u.id=p.seller_id LEFT JOIN shop_stores s ON s.id=p.shop_id
    WHERE p.id=$1 ${lock ? "FOR UPDATE OF p" : ""}`, [id]);
  assert(p && !await blocked(viewer, p.seller_id, q), 404, "Product not found");
  let role = viewer === p.seller_id ? "owner" : "buyer";
  if (p.shop_id) role = (await shopAccess(p.shop_id, viewer, q, editing ? MANAGE : undefined)).role;
  if (editing) assert(MANAGE.includes(role), 403, "You cannot manage this product");
  assert(p.is_published || role !== "buyer", 404, "Product is not published");
  return { ...p, role };
}
export async function productShape(id: string, viewer: string, q: Query = query, detail = false) {
  const p = await productAccess(id, viewer, q);
  const photos = await q(`SELECT media_id FROM commerce_photos WHERE product_id=$1 ORDER BY position`, [id]);
  const mediaIds = photos.length ? photos.map(r => r.media_id) : p.image_media_id ? [p.image_media_id] : [];
  const gallery = (await Promise.all(mediaIds.map(id => mediaShape(id, q)))).filter(Boolean);
  const variants = await q(`SELECT id,label,sku,price_minor AS "priceMinor",inventory FROM commerce_variants WHERE product_id=$1 AND active ORDER BY label,id`, [id]);
  const [flags] = await q(`SELECT EXISTS(SELECT 1 FROM commerce_saved WHERE product_id=$1 AND user_id=$2) AS saved,
    EXISTS(SELECT 1 FROM shop_orders o JOIN shop_order_items i ON i.order_id=o.id WHERE o.buyer_id=$2 AND i.product_id=$1 AND o.status='completed') AS eligible,
    (SELECT COALESCE(avg(rating),0)::float FROM commerce_reviews WHERE product_id=$1) AS rating,
    (SELECT count(*)::int FROM commerce_reviews WHERE product_id=$1) AS n`, [id, viewer]);
  const reviews = detail ? await q(`SELECT r.user_id AS "userId",u.name,r.rating,r.content,r.created_at AS "createdAt"
    FROM commerce_reviews r JOIN users u ON u.id=r.user_id WHERE product_id=$1 AND NOT EXISTS(
      SELECT 1 FROM blocks WHERE (user_id=$2 AND target_id=r.user_id) OR (target_id=$2 AND user_id=r.user_id))
    ORDER BY r.created_at DESC LIMIT 50`, [id, viewer]) : [];
  return {
    id, shopId: p.shop_id ?? undefined, shopName: p.shop_name ?? undefined, sellerId: p.seller_id, sellerName: p.seller_name,
    title: p.title, description: p.description, category: p.category, currency: p.currency,
    priceMinor: variants.length ? Math.min(...variants.map(v => v.priceMinor)) : p.price_minor,
    inventory: variants.length ? variants.reduce((n, v) => n + v.inventory, 0) : p.inventory,
    isPublished: p.is_published, gallery, variants, saved: flags.saved, reviewEligible: flags.eligible && viewer !== p.seller_id,
    rating: flags.rating, reviewCount: flags.n, reviews, createdAt: p.created_at,
  };
}
export function offset(cursor?: string) {
  try { return pageOffset(cursor); } catch { assert(false, 400, "Invalid pagination cursor"); }
}
export function paged<T>(items: T[], start: number, size = 24) {
  return { items: items.slice(0, size), ...(items.length > size ? { nextCursor: String(start + size) } : {}) };
}
export async function history(orderId: string, actor: string, action: string, note: string, q: Query) {
  await q("INSERT INTO commerce_history (id,order_id,actor_id,action,note) VALUES ($1,$2,$3,$4,$5)", [uuid(), orderId, actor, action, note]);
}
export async function orderShape(id: string, viewer: string, q: Query = query) {
  const [o] = await q(`SELECT o.*,b.name AS buyer_name,s.name AS seller_name FROM shop_orders o
    JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id WHERE o.id=$1`, [id]);
  assert(o, 404, "Order not found");
  if (viewer !== o.buyer_id && viewer !== o.seller_id) {
    assert(o.shop_id, 403);
    await shopAccess(o.shop_id, viewer, q, ORDERS);
  }
  const items = await q(`SELECT product_id AS "productId",variant_id AS "variantId",variant_label AS "variantLabel",
    sku,title,unit_price_minor AS "unitPriceMinor",quantity,(unit_price_minor*quantity)::int AS "lineTotalMinor"
    FROM shop_order_items WHERE order_id=$1 ORDER BY id`, [id]);
  const events = await q(`SELECT h.action,u.name AS "actorName",h.note,h.created_at AS "createdAt" FROM commerce_history h
    JOIN users u ON u.id=h.actor_id WHERE order_id=$1 ORDER BY h.created_at,h.id`, [id]);
  return {
    id, shopId: o.shop_id ?? undefined, sellerId: o.seller_id, sellerName: o.seller_name, buyerId: o.buyer_id, buyerName: o.buyer_name,
    currency: o.currency, items: items.map(i => ({ ...i, variantId: i.variantId ?? undefined, variantLabel: i.variantLabel ?? undefined, sku: i.sku ?? undefined })),
    subtotalMinor: o.subtotal_minor ?? o.total_minor, discountMinor: o.discount_minor, shippingMinor: o.shipping_minor,
    totalMinor: o.total_minor, paymentMethod: "manual", fulfillment: o.fulfillment,
    status: o.status, paymentStatus: o.payment_status, buyerNote: o.buyer_note,
    recipientName: o.recipient_name, phone: o.phone, address: o.address, trackingNumber: o.tracking_number, carrier: o.carrier,
    requestType: o.request_type, requestStatus: o.request_status, requestReason: o.request_reason,
    couponId: o.coupon_id ?? undefined, campaignId: o.campaign_id ?? undefined, createdAt: o.created_at, history: events,
  };
}
export async function recordEvent(shopId: string, viewer: string, kind: string, q: Query, productId?: string, campaignId?: string) {
  const shop = await shopAccess(shopId, viewer, q);
  // Exclude owner and approved collaborators from their own marketing funnel.
  if (shop.role !== "buyer") return;
  if (productId) {
    const p = await productAccess(productId, viewer, q);
    assert(p.shop_id === shopId && p.is_published, 400, "Product does not belong to this shop");
  }
  if (campaignId) {
    const [campaign] = await q("SELECT * FROM commerce_campaigns WHERE id=$1 AND shop_id=$2 AND active", [campaignId, shopId]);
    assert(campaign, 400, "Campaign is unavailable");
    assert(!campaign.product_id || campaign.product_id === productId || !productId, 400, "Campaign product mismatch");
    if (campaign.creator_id) assert((await q("SELECT 1 FROM commerce_team WHERE shop_id=$1 AND user_id=$2 AND role='creator'", [shopId, campaign.creator_id])).length, 400, "Creator approval has ended");
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = JSON.stringify([viewer, shopId, productId ?? "", campaignId ?? "", kind, day]);
  await q(`INSERT INTO commerce_events (id,shop_id,user_id,product_id,campaign_id,kind,dedup_key)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (dedup_key) DO NOTHING`, [uuid(), shopId, viewer, productId ?? null, campaignId ?? null, kind, key]);
}
