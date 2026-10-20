import { createHash } from "node:crypto";
import { assert, uuid, type Query, type Row } from "../lib/social";
import { canProgress } from "../lib/commerce-policy";
import { buildQuote } from "../lib/commerce/checkout";
import { MANAGE, ORDERS, history, offset, orderShape, paged, recordEvent, shopAccess } from "../lib/commerce/shared";
import type { CommerceRoute } from "../lib/commerce/http";

/** Order row lock + inventory_restored make repeated cancel/return attempts harmless. */
export async function restoreInventory(order: Row, q: Query) {
  if (order.inventory_restored) return;
  const items = await q("SELECT * FROM shop_order_items WHERE order_id=$1 ORDER BY product_id,variant_id", [order.id]);
  for (const i of items) {
    await q("SELECT id FROM shop_products WHERE id=$1 FOR UPDATE", [i.product_id]);
    if (i.variant_id) {
      await q("UPDATE commerce_variants SET inventory=inventory+$1 WHERE id=$2", [i.quantity, i.variant_id]);
      await q(`UPDATE shop_products SET inventory=(SELECT COALESCE(sum(inventory),0) FROM commerce_variants WHERE product_id=$1 AND active),updated_at=now() WHERE id=$1`, [i.product_id]);
    } else await q("UPDATE shop_products SET inventory=inventory+$1,updated_at=now() WHERE id=$2", [i.quantity, i.product_id]);
  }
  await q("UPDATE shop_orders SET inventory_restored=true WHERE id=$1", [order.id]);
}
export default function orders(route: CommerceRoute) {
  route("post", "/commerce/quote", "CommerceQuote", c => buildQuote(c.b, c.u, c.q));
  route("post", "/commerce/orders", "CommercePlaceOrder", async c => {
    assert(c.b.idempotencyKey, 400, "A checkout retry key is required");
    const { idempotencyKey, ...payload } = c.b;
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    await c.q("SELECT pg_advisory_xact_lock(hashtextextended($1,9021))", [`${c.u}:${idempotencyKey}`]);
    const [existing] = await c.q("SELECT id,checkout_hash FROM shop_orders WHERE buyer_id=$1 AND idempotency_key=$2", [c.u, idempotencyKey]);
    if (existing) {
      assert(existing.checkout_hash === hash, 409, "This retry key belongs to a different checkout");
      return orderShape(existing.id, c.u, c.q);
    }
    assert(c.b.recipientName?.trim() && c.b.phone?.trim(), 400, "Add a recipient name and contact phone");
    if (c.b.fulfillment === "delivery") assert(c.b.address?.trim().length >= 5, 400, "Add a delivery address");
    const quote = await buildQuote(c.b, c.u, c.q, true);
    assert(Number.isInteger(c.b.expectedTotalMinor) && quote.totalMinor === c.b.expectedTotalMinor, 409, "Prices changed or a quote is missing. Review your checkout total again");
    const id = uuid();
    await c.q(`INSERT INTO shop_orders (id,buyer_id,seller_id,shop_id,buyer_note,total_minor,currency,subtotal_minor,discount_minor,
      shipping_minor,fulfillment,recipient_name,phone,address,coupon_id,campaign_id,idempotency_key,checkout_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`, [
      id, c.u, quote.sellerId, quote.shopId ?? null, c.b.buyerNote?.trim() ?? "", quote.totalMinor, quote.currency, quote.subtotalMinor,
      quote.discountMinor, quote.shippingMinor, quote.fulfillment, c.b.recipientName.trim(), c.b.phone.trim(), c.b.address?.trim() ?? "",
      quote.couponId ?? null, quote.campaignId ?? null, idempotencyKey, hash,
    ]);
    for (const i of quote.items) {
      if (i.variantId) {
        assert((await c.q("UPDATE commerce_variants SET inventory=inventory-$1 WHERE id=$2 AND inventory >= $1 RETURNING id", [i.quantity, i.variantId])).length, 409, "Variant just sold out");
        await c.q(`UPDATE shop_products SET inventory=(SELECT sum(inventory) FROM commerce_variants WHERE product_id=$1 AND active),updated_at=now() WHERE id=$1`, [i.productId]);
      } else assert((await c.q("UPDATE shop_products SET inventory=inventory-$1,updated_at=now() WHERE id=$2 AND inventory >= $1 RETURNING id", [i.quantity, i.productId])).length, 409, "Product just sold out");
      await c.q(`INSERT INTO shop_order_items (id,order_id,product_id,title,unit_price_minor,quantity,variant_id,variant_label,sku)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [uuid(), id, i.productId, i.title, i.unitPriceMinor, i.quantity, i.variantId ?? null, i.variantLabel ?? null, i.sku ?? null]);
    }
    if (quote.couponId) await c.q("INSERT INTO commerce_redemptions (order_id,coupon_id,user_id) VALUES ($1,$2,$3)", [id, quote.couponId, c.u]);
    await history(id, c.u, "placed", "Manual payment; no charge has been processed by VastMind.", c.q);
    if (quote.shopId) await recordEvent(quote.shopId, c.u, "order", c.q, undefined, quote.campaignId);
    c.impact.add(quote.sellerId);
    if (quote.shopId) for (const member of await c.q("SELECT user_id FROM commerce_team WHERE shop_id=$1 AND role=ANY($2::text[])", [quote.shopId, ORDERS])) c.impact.add(member.user_id);
    return orderShape(id, c.u, c.q);
  }, 201);
  route("get", "/commerce/orders", "CommerceListOrders", async c => {
    const start = offset(c.s.cursor), seller = c.s.scope === "seller";
    let owner: string | undefined;
    if (seller && c.s.shopId) owner = (await shopAccess(c.s.shopId, c.u, c.q, ORDERS)).owner_id;
    const rows = await c.q(`SELECT o.id FROM shop_orders o WHERE
      CASE WHEN $1::boolean THEN CASE WHEN $2::text IS NOT NULL THEN (o.shop_id=$2 OR (o.shop_id IS NULL AND o.seller_id=$3)) ELSE o.seller_id=$4 END ELSE o.buyer_id=$4 END
      AND ($5::text IS NULL OR o.status=$5) ORDER BY o.created_at DESC,o.id LIMIT 25 OFFSET $6`,
    [seller, seller ? c.s.shopId ?? null : null, owner ?? null, c.u, c.s.status ?? null, start]);
    return paged(await Promise.all(rows.map(r => orderShape(r.id, c.u, c.q))), start);
  });
  route("patch", "/commerce/orders/:orderId", "CommerceUpdateOrder", async c => {
    const [o] = await c.q("SELECT * FROM shop_orders WHERE id=$1 FOR UPDATE", [c.p.orderId]);
    assert(o, 404, "Order not found");
    const action = c.b.action, buyer = o.buyer_id === c.u;
    let role = o.seller_id === c.u ? "owner" : "buyer";
    if (!buyer && o.shop_id) role = (await shopAccess(o.shop_id, c.u, c.q, ORDERS)).role;
    const seller = ORDERS.includes(role);
    if (action === "request_cancel" || action === "request_return") {
      assert(buyer, 403, "Only the buyer can make a request");
      assert(o.request_status !== "pending", 409, "An order request is already pending");
      assert(action === "request_return" ? o.status === "completed" : ["pending", "confirmed", "preparing"].includes(o.status), 409, "This request is not available at the current order stage");
      assert(c.b.reason?.trim().length >= 5, 400, "Explain the reason for your request");
      await c.q("UPDATE shop_orders SET request_type=$1,request_status='pending',request_reason=$2,updated_at=now() WHERE id=$3",
        [action === "request_cancel" ? "cancel" : "return", c.b.reason.trim(), o.id]);
    } else {
      assert(seller, 403, "Only an authorized seller can perform this action");
      if (action === "manual_paid") {
        assert(MANAGE.includes(role), 403, "Only an owner or manager can confirm received payment");
        assert(o.payment_status === "awaiting_manual" && !["cancelled", "returned"].includes(o.status), 409, "Payment cannot be recorded for this order");
        await c.q("UPDATE shop_orders SET payment_status='manual_confirmed',updated_at=now() WHERE id=$1", [o.id]);
      } else if (action === "tracking") {
        assert(!["cancelled", "returned"].includes(o.status) && o.fulfillment === "delivery", 409, "Tracking is only available for active delivery orders");
        assert(c.b.trackingNumber?.trim() && c.b.carrier?.trim(), 400, "Add a carrier and tracking number");
        await c.q("UPDATE shop_orders SET tracking_number=$1,carrier=$2,updated_at=now() WHERE id=$3", [c.b.trackingNumber.trim(), c.b.carrier.trim(), o.id]);
      } else if (action === "approve_request" || action === "reject_request") {
        assert(o.request_status === "pending", 409, "No pending request");
        if (action === "approve_request") {
          assert(o.request_type === "return" ? o.status === "completed" : ["pending", "confirmed", "preparing"].includes(o.status), 409, "The order stage no longer permits this request");
          if (o.payment_status === "manual_confirmed") assert(MANAGE.includes(role) && c.b.paymentResolvedManually === true, 409, "An owner or manager must confirm that payment/refund has been resolved outside VastMind");
          await restoreInventory(o, c.q);
          await c.q("UPDATE shop_orders SET status=$1,request_status='approved',updated_at=now() WHERE id=$2", [o.request_type === "return" ? "returned" : "cancelled", o.id]);
        } else {
          assert(c.b.reason?.trim().length >= 5, 400, "Explain why the request is declined");
          await c.q("UPDATE shop_orders SET request_status='rejected',updated_at=now() WHERE id=$1", [o.id]);
        }
      } else if (action === "cancel") {
        assert(["pending", "confirmed", "preparing"].includes(o.status), 409, "Order cannot be cancelled at this stage");
        if (o.payment_status === "manual_confirmed") assert(MANAGE.includes(role) && c.b.paymentResolvedManually === true, 409, "Confirm the manual payment/refund was resolved outside VastMind");
        await restoreInventory(o, c.q);
        await c.q("UPDATE shop_orders SET status='cancelled',request_status=CASE WHEN request_status='pending' THEN 'approved' ELSE request_status END,updated_at=now() WHERE id=$1", [o.id]);
      } else {
        assert(canProgress(o.status, action) && o.request_status !== "pending", 409, "This order transition is not available");
        const status = { confirm: "confirmed", prepare: "preparing", complete: "completed" }[action as "confirm" | "prepare" | "complete"];
        await c.q("UPDATE shop_orders SET status=$1,updated_at=now() WHERE id=$2", [status, o.id]);
      }
    }
    await history(o.id, c.u, action, c.b.reason?.trim() ?? (action === "manual_paid" ? "Seller attests payment was received manually. No processor transaction." : c.b.paymentResolvedManually ? "Seller attests manual payment/refund resolved outside VastMind." : ""), c.q);
    c.impact.add(o.buyer_id); c.impact.add(o.seller_id);
    return orderShape(o.id, c.u, c.q);
  });
}
