import { test } from "node:test";
import strict from "node:assert/strict";
import { pool } from "@workspace/db";
import * as schemas from "@workspace/api-zod";
import { uuid, HttpError, type Query, type Row } from "./social";
import type { CommerceContext, CommerceRoute } from "./commerce/http";
import catalog from "../routes/commerce-catalog";
import orders from "../routes/commerce-orders";
import marketing from "../routes/commerce-marketing";

const handlers = new Map<string, (c: CommerceContext) => Promise<unknown>>();
const route: CommerceRoute = (_method, _path, operation, handler) => { handlers.set(operation, handler); };
catalog(route); orders(route); marketing(route);
const enabled = process.env.RUN_COMMERCE_DB_TESTS === "1";
function clean(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  return value;
}

// Opt-in integration suite: every fixture and mutation is rolled back, never run against production.
test("commerce relational checkout, roles, coupons, fulfillment, returns, CRM and attribution", { skip: !enabled }, async () => {
  strict.notEqual(process.env.NODE_ENV, "production");
  const client = await pool.connect();
  await client.query("BEGIN");
  const q: Query = async (sql, values) => (await client.query(sql, values)).rows;
  const users = { seller: uuid(), buyer: uuid(), buyer2: uuid(), creator: uuid(), fulfillment: uuid(), marketer: uuid(), stranger: uuid() };
  const registry = schemas as unknown as Record<string, { parse: (v: unknown) => any }>;
  const call = async (operation: string, u: string, b: Row = {}, p: Record<string, string> = {}, s: Row = {}) => {
    const data = await handlers.get(operation)!({ u, user: { id: u }, p, b, s, q, impact: new Set([u]) });
    return registry[`${operation}Response`].parse(clean(data));
  };
  try {
    for (const [name, id] of Object.entries(users)) await q("INSERT INTO users (id,name,username) VALUES ($1,$2,$1)", [id, `Commerce ${name}`]);
    const legacy = uuid();
    await q("INSERT INTO shop_products (id,seller_id,title,price_minor,currency,inventory) VALUES ($1,$2,'Legacy',500,'USD',8)", [legacy, users.seller]);
    const shop = await call("CommerceCreateShop", users.seller, {
      name: "Commerce test shop", slug: `test-${uuid()}`, category: "Books", currency: "USD",
      deliveryEnabled: true, pickupEnabled: true, pickupDetails: "Pick up at reception", shippingMinor: 250,
    });
    strict.equal((await q("SELECT shop_id FROM shop_products WHERE id=$1", [legacy]))[0].shop_id, shop.id);
    strict.equal((await q("SELECT inventory FROM shop_products WHERE id=$1", [legacy]))[0].inventory, 8);
    const product = await call("CommerceCreateProduct", users.seller, {
      shopId: shop.id, title: "Variant book", description: "Real order fixture", category: "Books", priceMinor: 1000,
      inventory: 3, isPublished: true, mediaIds: [],
      variants: [{ label: "Blue", sku: "BLUE", priceMinor: 1200, inventory: 3 }, { label: "Red", sku: "RED", priceMinor: 1500, inventory: 1 }],
    });
    strict.equal(product.inventory, 4);
    const blue = product.variants.find((v: Row) => v.sku === "BLUE").id;
    for (const role of ["creator", "fulfillment", "marketer"] as const) await call("CommerceUpdateTeam", users.seller, { userId: users[role], role, approved: true }, { shopId: shop.id });
    await strict.rejects(() => call("CommerceUpdateTeam", users.marketer, { userId: users.stranger, role: "manager", approved: true }, { shopId: shop.id }), HttpError);
    await strict.rejects(() => call("CommerceListOrders", users.creator, {}, {}, { scope: "seller", shopId: shop.id }), HttpError);
    await strict.rejects(() => call("CommerceListCustomers", users.creator, {}, { shopId: shop.id }), HttpError);
    await strict.rejects(() => call("CommerceGetDashboard", users.stranger, {}, { shopId: shop.id }), HttpError);
    await strict.rejects(() => call("CommerceCreateProduct", users.fulfillment, {
      shopId: shop.id, title: "Forbidden", category: "Books", priceMinor: 100, inventory: 1, isPublished: true, mediaIds: [], variants: [],
    }), HttpError);
    const coupon = await call("CommerceCreateCoupon", users.marketer, {
      code: "TEST15", kind: "percent", value: 15, minSpendMinor: 1000, maxRedemptions: 2, perBuyerLimit: 1,
      expiresAt: new Date(Date.now() + 86400000).toISOString(), productIds: [product.id],
    }, { shopId: shop.id });
    const campaign = await call("CommerceCreateCampaign", users.marketer, { name: "Creator launch", productId: product.id, creatorId: users.creator, couponId: coupon.id }, { shopId: shop.id });
    const publicCampaign = await call("CommerceGetCampaign", users.buyer, {}, { campaignId: campaign.id });
    strict.equal(publicCampaign.couponCode, "TEST15");
    strict.equal(publicCampaign.clicks, undefined, "Public attribution must not reveal private analytics");
    strict.equal((await call("CommerceListCampaigns", users.creator, {}, { shopId: shop.id })).length, 1);
    const input = { items: [{ productId: product.id, variantId: blue, quantity: 2 }], fulfillment: "delivery", recipientName: "Buyer", phone: "+1000000", address: "Delivery reception", couponCode: "TEST15", campaignId: campaign.id };
    const quote = await call("CommerceQuote", users.buyer, input);
    strict.equal(quote.subtotalMinor, 2400); strict.equal(quote.discountMinor, 360); strict.equal(quote.shippingMinor, 250); strict.equal(quote.totalMinor, 2290);
    await strict.rejects(() => call("CommercePlaceOrder", users.buyer, { ...input, idempotencyKey: uuid(), expectedTotalMinor: 1 }), HttpError);
    await strict.rejects(() => call("CommerceQuote", users.buyer, { ...input, items: [{ productId: product.id, quantity: 1 }] }), HttpError);
    await strict.rejects(() => call("CommerceQuote", users.buyer, { ...input, items: [{ productId: product.id, variantId: blue, quantity: 4 }] }), HttpError);
    const key = uuid();
    const order = await call("CommercePlaceOrder", users.buyer, { ...input, idempotencyKey: key, expectedTotalMinor: quote.totalMinor });
    strict.equal(order.paymentStatus, "awaiting_manual");
    strict.equal((await q("SELECT inventory FROM commerce_variants WHERE id=$1", [blue]))[0].inventory, 1);
    strict.equal((await call("CommercePlaceOrder", users.buyer, { ...input, idempotencyKey: key, expectedTotalMinor: quote.totalMinor })).id, order.id);
    strict.equal((await q("SELECT count(*)::int AS n FROM shop_orders WHERE buyer_id=$1", [users.buyer]))[0].n, 1);
    await strict.rejects(() => call("CommercePlaceOrder", users.buyer, { ...input, recipientName: "Changed", idempotencyKey: key, expectedTotalMinor: quote.totalMinor }), HttpError);
    await strict.rejects(() => call("CommerceQuote", users.buyer, { ...input, items: [{ productId: product.id, variantId: blue, quantity: 1 }] }), HttpError);
    await strict.rejects(() => call("CommerceUpdateOrder", users.stranger, { action: "confirm" }, { orderId: order.id }), HttpError);
    await strict.rejects(() => call("CommerceUpdateOrder", users.fulfillment, { action: "manual_paid" }, { orderId: order.id }), HttpError);
    await call("CommerceUpdateOrder", users.seller, { action: "manual_paid" }, { orderId: order.id });
    for (const action of ["confirm", "prepare", "complete"]) await call("CommerceUpdateOrder", users.fulfillment, { action }, { orderId: order.id });
    const reviewed = await call("CommerceReviewProduct", users.buyer, { rating: 5, content: "Verified purchase review" }, { productId: product.id });
    strict.equal(reviewed.rating, 5); strict.equal(reviewed.reviews.length, 1);
    await strict.rejects(() => call("CommerceReviewProduct", users.buyer2, { rating: 5, content: "Not purchased" }, { productId: product.id }), HttpError);
    await call("CommerceFollowShop", users.buyer, { following: true, marketingOptIn: false }, { shopId: shop.id });
    await call("CommerceUpdateCustomer", users.marketer, { notes: "Private service note", labels: ["VIP"] }, { shopId: shop.id, userId: users.buyer });
    const customers = await call("CommerceListCustomers", users.marketer, {}, { shopId: shop.id });
    strict.equal(customers.items[0].notes, "Private service note"); strict.equal(customers.items[0].marketingOptIn, false);
    await call("CommerceUpdateOrder", users.buyer, { action: "request_return", reason: "Please accept this return" }, { orderId: order.id });
    await strict.rejects(() => call("CommerceUpdateOrder", users.seller, { action: "approve_request" }, { orderId: order.id }), HttpError);
    const returned = await call("CommerceUpdateOrder", users.seller, { action: "approve_request", paymentResolvedManually: true }, { orderId: order.id });
    strict.equal(returned.status, "returned"); strict.ok(returned.history.length >= 7);
    strict.equal((await q("SELECT inventory FROM commerce_variants WHERE id=$1", [blue]))[0].inventory, 3);
    await strict.rejects(() => call("CommerceUpdateOrder", users.seller, { action: "approve_request", paymentResolvedManually: true }, { orderId: order.id }), HttpError);
    strict.equal((await q("SELECT inventory FROM commerce_variants WHERE id=$1", [blue]))[0].inventory, 3);
    // Dedupe is server-side even if a client sends the same event repeatedly.
    for (let i = 0; i < 3; i++) await call("CommerceRecordEvent", users.buyer, { shopId: shop.id, productId: product.id, campaignId: campaign.id, kind: "view" });
    const dashboard = await call("CommerceGetDashboard", users.marketer, {}, { shopId: shop.id });
    strict.equal(dashboard.views, 1); strict.equal(dashboard.conversions, 1);
    strict.equal(dashboard.currencies[0].processorPaidValueMinor, 0); strict.equal(dashboard.currencies[0].manualConfirmedValueMinor, 0);
    const postId = uuid();
    await q("INSERT INTO posts (id,author_id,content) VALUES ($1,$2,'Shoppable content')", [postId, users.creator]);
    strict.equal((await call("CommerceTagContent", users.creator, { productIds: [product.id] }, { postId })).length, 1);
    await call("CommerceUpdateTeam", users.seller, { userId: users.creator, role: "creator", approved: false }, { shopId: shop.id });
    strict.equal((await call("CommerceListContentProducts", users.buyer, {}, { postId })).length, 0);
    await strict.rejects(() => call("CommerceGetCampaign", users.buyer, {}, { campaignId: campaign.id }), HttpError);
    await call("CommerceReport", users.buyer, { kind: "product", targetId: product.id, reason: "Listing needs review" });
    strict.equal((await q("SELECT count(*)::int AS n FROM commerce_reports WHERE target_id=$1", [product.id]))[0].n, 1);
    await q("INSERT INTO blocks (user_id,target_id) VALUES ($1,$2)", [users.buyer, users.seller]);
    await strict.rejects(() => call("CommerceGetProduct", users.buyer, {}, { productId: product.id }), HttpError);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
