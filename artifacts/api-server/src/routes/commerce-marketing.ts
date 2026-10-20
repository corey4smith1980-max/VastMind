import { assert, uuid, type Query, type Row } from "../lib/social";
import { dateRange } from "../lib/commerce-policy";
import { MARKET, offset, paged, productAccess, recordEvent, shopAccess } from "../lib/commerce/shared";
import type { CommerceContext, CommerceRoute } from "../lib/commerce/http";

async function couponShape(id: string, q: Query) {
  const [r] = await q(`SELECT c.*,(SELECT count(*)::int FROM commerce_redemptions WHERE coupon_id=c.id) AS n
    FROM commerce_coupons c WHERE c.id=$1`, [id]);
  assert(r);
  return { id: r.id, shopId: r.shop_id, code: r.code, kind: r.kind, value: r.value, currency: r.currency,
    minSpendMinor: r.min_spend_minor, maxRedemptions: r.max_redemptions, perBuyerLimit: r.per_buyer_limit,
    expiresAt: r.expires_at, productIds: r.product_ids, active: r.active, redemptions: r.n };
}
async function campaignAccess(id: string, c: CommerceContext, editing = false) {
  const [r] = await c.q("SELECT * FROM commerce_campaigns WHERE id=$1", [id]);
  assert(r, 404, "Campaign not found");
  const shop = await shopAccess(r.shop_id, c.u, c.q);
  if (editing) assert(MARKET.includes(shop.role) || (shop.role === "creator" && r.creator_id === c.u), 403, "Campaign management is not permitted");
  else if (!MARKET.includes(shop.role) && !(shop.role === "creator" && r.creator_id === c.u)) assert(r.active && shop.is_published, 404, "Campaign is no longer active");
  if (r.creator_id) assert((await c.q("SELECT 1 FROM commerce_team WHERE shop_id=$1 AND user_id=$2 AND role='creator'", [shop.id, r.creator_id])).length, 404, "Creator approval has ended");
  return { campaign: r, shop };
}
async function campaignShape(r: Row, q: Query, metrics = true, range?: { from: string; to: string }) {
  const [extra] = await q(`SELECT u.name AS creator_name,c.code FROM (SELECT 1) x
    LEFT JOIN users u ON u.id=$1 LEFT JOIN commerce_coupons c ON c.id=$2 AND c.active AND c.expires_at>now()`, [r.creator_id, r.coupon_id]);
  let numbers: Row = {};
  if (metrics) {
    const [counts] = await q(`SELECT
      (SELECT count(*)::int FROM commerce_events WHERE campaign_id=$1 AND kind IN ('product_click','campaign_click')
        AND ($2::date IS NULL OR created_at >= $2::date) AND ($3::date IS NULL OR created_at < $3::date+interval '1 day')) AS clicks,
      (SELECT count(*)::int FROM commerce_events WHERE campaign_id=$1 AND kind='add_to_cart'
        AND ($2::date IS NULL OR created_at >= $2::date) AND ($3::date IS NULL OR created_at < $3::date+interval '1 day')) AS carts,
      (SELECT count(*)::int FROM shop_orders WHERE campaign_id=$1
        AND ($2::date IS NULL OR created_at >= $2::date) AND ($3::date IS NULL OR created_at < $3::date+interval '1 day')) AS orders`,
    [r.id, range?.from ?? null, range?.to ?? null]);
    numbers = counts;
  }
  const params = new URLSearchParams({ shop: r.shop_id, campaign: r.id });
  if (r.product_id) params.set("product", r.product_id);
  return { id: r.id, shopId: r.shop_id, name: r.name, productId: r.product_id ?? undefined,
    creatorId: r.creator_id ?? undefined, creatorName: extra?.creator_name ?? undefined, couponCode: extra?.code ?? undefined,
    active: r.active, linkPath: `/shop?${params}`, ...numbers };
}
export default function marketing(route: CommerceRoute) {
  route("get", "/commerce/shops/:shopId/coupons", "CommerceListCoupons", async c => {
    await shopAccess(c.p.shopId, c.u, c.q, MARKET);
    const rows = await c.q("SELECT id FROM commerce_coupons WHERE shop_id=$1 ORDER BY created_at DESC LIMIT 200", [c.p.shopId]);
    return Promise.all(rows.map(r => couponShape(r.id, c.q)));
  });
  route("post", "/commerce/shops/:shopId/coupons", "CommerceCreateCoupon", async c => {
    const shop = await shopAccess(c.p.shopId, c.u, c.q, MARKET, true), b = c.b;
    assert(b.kind !== "percent" || b.value <= 100, 400, "Percentage cannot exceed 100");
    assert(new Date(b.expiresAt).getTime() > Date.now(), 400, "Expiry must be in the future");
    assert(b.perBuyerLimit <= b.maxRedemptions, 400, "Buyer limit cannot exceed total redemptions");
    const ids = [...new Set<string>(b.productIds ?? [])];
    for (const id of ids) assert((await productAccess(id, c.u, c.q)).shop_id === shop.id, 400, "Coupon products must belong to this shop");
    const id = uuid();
    await c.q(`INSERT INTO commerce_coupons (id,shop_id,code,kind,value,currency,min_spend_minor,max_redemptions,per_buyer_limit,expires_at,product_ids)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, shop.id, b.code.toUpperCase(), b.kind, b.value, shop.currency, b.minSpendMinor,
      b.maxRedemptions, b.perBuyerLimit, b.expiresAt, ids]);
    return couponShape(id, c.q);
  }, 201);
  route("patch", "/commerce/coupons/:couponId", "CommerceUpdateCoupon", async c => {
    const [r] = await c.q("SELECT shop_id FROM commerce_coupons WHERE id=$1", [c.p.couponId]); assert(r);
    await shopAccess(r.shop_id, c.u, c.q, MARKET, true);
    await c.q("UPDATE commerce_coupons SET active=$1 WHERE id=$2", [c.b.active, c.p.couponId]);
    return couponShape(c.p.couponId, c.q);
  });
  route("get", "/commerce/shops/:shopId/campaigns", "CommerceListCampaigns", async c => {
    const shop = await shopAccess(c.p.shopId, c.u, c.q, [...MARKET, "creator"]);
    const rows = await c.q(`SELECT * FROM commerce_campaigns WHERE shop_id=$1 AND ($2::boolean OR creator_id=$3)
      ORDER BY created_at DESC LIMIT 200`, [shop.id, MARKET.includes(shop.role), c.u]);
    return Promise.all(rows.map(r => campaignShape(r, c.q)));
  });
  route("post", "/commerce/shops/:shopId/campaigns", "CommerceCreateCampaign", async c => {
    const shop = await shopAccess(c.p.shopId, c.u, c.q, [...MARKET, "creator"], true), b = c.b;
    assert(b.name.trim(), 400, "Campaign name is required");
    const creator = shop.role === "creator" ? c.u : b.creatorId;
    if (b.productId) {
      const product = await productAccess(b.productId, c.u, c.q);
      assert(product.shop_id === shop.id && product.is_published, 400, "Choose a published product from this shop");
    }
    if (creator) assert((await c.q("SELECT 1 FROM commerce_team WHERE shop_id=$1 AND user_id=$2 AND role='creator'", [shop.id, creator])).length, 400, "Approve this creator on the team first");
    assert(shop.role !== "creator" || !b.couponId, 403, "Only a marketer can assign coupon codes");
    if (b.couponId) assert((await c.q("SELECT 1 FROM commerce_coupons WHERE id=$1 AND shop_id=$2 AND active AND expires_at>now()", [b.couponId, shop.id])).length, 400, "Coupon unavailable");
    const id = uuid();
    const [r] = await c.q(`INSERT INTO commerce_campaigns (id,shop_id,name,product_id,creator_id,coupon_id)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [id, shop.id, b.name.trim(), b.productId ?? null, creator ?? null, b.couponId ?? null]);
    return campaignShape(r, c.q);
  }, 201);
  route("get", "/commerce/campaigns/:campaignId", "CommerceGetCampaign", async c => {
    const { campaign, shop } = await campaignAccess(c.p.campaignId, c);
    return campaignShape(campaign, c.q, MARKET.includes(shop.role) || (shop.role === "creator" && campaign.creator_id === c.u));
  });
  route("patch", "/commerce/campaigns/:campaignId", "CommerceUpdateCampaign", async c => {
    const { campaign } = await campaignAccess(c.p.campaignId, c, true);
    await shopAccess(campaign.shop_id, c.u, c.q, [...MARKET, "creator"], true);
    const [r] = await c.q("UPDATE commerce_campaigns SET active=$1 WHERE id=$2 RETURNING *", [c.b.active, campaign.id]);
    return campaignShape(r, c.q);
  });
  route("get", "/commerce/shops/:shopId/dashboard", "CommerceGetDashboard", async c => {
    const shop = await shopAccess(c.p.shopId, c.u, c.q, MARKET);
    let range: { from: string; to: string };
    try { range = dateRange(c.s.from, c.s.to); } catch { assert(false, 400, "Use valid YYYY-MM-DD dates, up to one year apart"); }
    const args = [shop.id, shop.owner_id, range.from, range.to];
    const orderScope = "(o.shop_id=$1 OR (o.shop_id IS NULL AND o.seller_id=$2)) AND o.created_at >= $3::date AND o.created_at < $4::date+interval '1 day'";
    const currencies = await c.q(`SELECT o.currency,
      COALESCE(sum(o.total_minor),0)::float AS "grossOrderValueMinor",
      COALESCE(sum(o.total_minor) FILTER(WHERE o.status='completed'),0)::float AS "completedValueMinor",
      COALESCE(sum(o.total_minor) FILTER(WHERE o.payment_status='manual_confirmed' AND o.status NOT IN ('cancelled','returned')),0)::float AS "manualConfirmedValueMinor",
      0::int AS "processorPaidValueMinor",count(*)::int AS "orderCount" FROM shop_orders o WHERE ${orderScope} GROUP BY o.currency`, args);
    const topProducts = await c.q(`SELECT i.product_id AS "productId",max(i.title) AS title,sum(i.quantity)::int AS units,o.currency,
      sum(i.unit_price_minor::bigint*i.quantity)::float AS "orderValueMinor" FROM shop_orders o JOIN shop_order_items i ON i.order_id=o.id
      WHERE ${orderScope} AND o.status NOT IN ('cancelled','returned') GROUP BY i.product_id,o.currency ORDER BY sum(i.quantity) DESC LIMIT 20`, args);
    const [counts] = await c.q(`SELECT
      (SELECT count(*)::int FROM shop_products WHERE shop_id=$1) AS products,
      (SELECT count(*)::int FROM shop_products WHERE shop_id=$1 AND is_published AND inventory<=5) AS low,
      (SELECT count(*)::int FROM commerce_followers WHERE shop_id=$1) AS followers,
      (SELECT count(*)::int FROM shop_orders o WHERE (o.shop_id=$1 OR (o.shop_id IS NULL AND o.seller_id=$2)) AND o.status='pending') AS pending,
      (SELECT count(*)::int FROM shop_orders o WHERE ${orderScope}) AS orders,
      (SELECT count(*)::int FROM commerce_events WHERE shop_id=$1 AND kind='view' AND created_at >= $3::date AND created_at < $4::date+interval '1 day') AS views,
      (SELECT count(*)::int FROM commerce_events WHERE shop_id=$1 AND kind IN ('product_click','campaign_click') AND created_at >= $3::date AND created_at < $4::date+interval '1 day') AS clicks,
      (SELECT count(*)::int FROM commerce_events WHERE shop_id=$1 AND kind='add_to_cart' AND created_at >= $3::date AND created_at < $4::date+interval '1 day') AS carts`, args);
    const campaigns = await c.q("SELECT * FROM commerce_campaigns WHERE shop_id=$1 ORDER BY created_at DESC LIMIT 100", [shop.id]);
    return { ...range, productCount: counts.products, lowStockCount: counts.low, followerCount: counts.followers, pendingOrders: counts.pending,
      views: counts.views, clicks: counts.clicks, carts: counts.carts, conversions: counts.orders, currencies, topProducts,
      campaigns: await Promise.all(campaigns.map(r => campaignShape(r, c.q, true, range))) };
  });
  route("get", "/commerce/shops/:shopId/customers", "CommerceListCustomers", async c => {
    const shop = await shopAccess(c.p.shopId, c.u, c.q, MARKET), start = offset(c.s.cursor);
    const rows = await c.q(`SELECT u.id AS "userId",u.name,u.username,count(o.id)::int AS "orderCount",
      COALESCE(n.notes,'') AS notes,COALESCE(n.labels,ARRAY[]::text[]) AS labels,COALESCE(f.marketing_opt_in,false) AS "marketingOptIn"
      FROM shop_orders o JOIN users u ON u.id=o.buyer_id
      LEFT JOIN commerce_customers n ON n.shop_id=$1 AND n.user_id=u.id
      LEFT JOIN commerce_followers f ON f.shop_id=$1 AND f.user_id=u.id
      WHERE (o.shop_id=$1 OR (o.shop_id IS NULL AND o.seller_id=$2))
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=$3 AND target_id=u.id) OR (target_id=$3 AND user_id=u.id))
      GROUP BY u.id,n.notes,n.labels,f.marketing_opt_in ORDER BY max(o.created_at) DESC,u.id LIMIT 25 OFFSET $4`, [shop.id, shop.owner_id, c.u, start]);
    return paged(rows, start);
  });
  route("patch", "/commerce/shops/:shopId/customers/:userId", "CommerceUpdateCustomer", async c => {
    const shop = await shopAccess(c.p.shopId, c.u, c.q, MARKET);
    assert((await c.q("SELECT 1 FROM shop_orders WHERE buyer_id=$1 AND (shop_id=$2 OR (shop_id IS NULL AND seller_id=$3)) LIMIT 1", [c.p.userId, shop.id, shop.owner_id])).length, 404, "Customer not found");
    await c.q(`INSERT INTO commerce_customers (shop_id,user_id,notes,labels) VALUES ($1,$2,$3,$4)
      ON CONFLICT (shop_id,user_id) DO UPDATE SET notes=$3,labels=$4`, [shop.id, c.p.userId, c.b.notes.trim(), [...new Set(c.b.labels.map((l: string) => l.trim()).filter(Boolean))]]);
    return { success: true };
  });
  route("post", "/commerce/events", "CommerceRecordEvent", async c => {
    await recordEvent(c.b.shopId, c.u, c.b.kind, c.q, c.b.productId, c.b.campaignId);
    return { success: true };
  });
}
