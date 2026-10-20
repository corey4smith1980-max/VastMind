import { test } from "node:test";
import strict from "node:assert/strict";
import { currencyCode, discountAmount, dateRange, canProgress, pageOffset } from "./commerce-policy";
import { CommerceCreateProductBody, CommercePlaceOrderBody, CommerceCreateCouponBody, CommerceUpdateTeamBody } from "@workspace/api-zod";

test("commerce money, date boundaries and order transitions", () => {
  strict.equal(currencyCode("ngn"), "NGN");
  strict.equal(currencyCode("JPY"), "JPY");
  strict.throws(() => currencyCode("INVALID"));
  strict.equal(discountAmount("percent", 15, 999), 149);
  strict.equal(discountAmount("fixed", 2000, 999), 999);
  strict.throws(() => discountAmount("percent", 101, 100));
  strict.deepEqual(dateRange("2026-01-01", "2026-01-31"), { from: "2026-01-01", to: "2026-01-31" });
  strict.throws(() => dateRange("2026-02-30", "2026-03-01"));
  strict.throws(() => dateRange("2026-02-02", "2026-02-01"));
  strict.throws(() => dateRange("2026-01-01T00:00:00Z", "2026-02-01"));
  strict.equal(canProgress("pending", "confirm"), true);
  strict.equal(canProgress("pending", "complete"), false);
  strict.equal(canProgress("cancelled", "prepare"), false);
  strict.equal(pageOffset("24"), 24);
  strict.throws(() => pageOffset("-1"));
  strict.throws(() => pageOffset("0;DROP TABLE users"));
});
test("commerce contracts bound stock, prices, roles, quantity and coupons", () => {
  const product = { shopId: "shop", title: "Test", category: "Books", priceMinor: 100, inventory: 2, isPublished: true, mediaIds: [], variants: [] };
  strict.equal(CommerceCreateProductBody.safeParse(product).success, true);
  strict.equal(CommerceCreateProductBody.safeParse({ ...product, priceMinor: -1 }).success, false);
  strict.equal(CommerceCreateProductBody.safeParse({ ...product, inventory: -1 }).success, false);
  strict.equal(CommercePlaceOrderBody.safeParse({ items: [{ productId: "p", quantity: 100 }], fulfillment: "pickup" }).success, false);
  strict.equal(CommercePlaceOrderBody.safeParse({ items: [], fulfillment: "pickup" }).success, false);
  strict.equal(CommerceUpdateTeamBody.safeParse({ userId: "x", role: "owner", approved: true }).success, false);
  strict.equal(CommerceCreateCouponBody.safeParse({ code: "<script>", kind: "fixed", value: 1, minSpendMinor: 0, maxRedemptions: 1, perBuyerLimit: 1, expiresAt: new Date().toISOString() }).success, false);
});
